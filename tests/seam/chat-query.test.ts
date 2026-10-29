import { Client as PgClient } from "pg";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  anonClient,
  dbUrl,
  ensureTestUsers,
  expectError,
  resetDomainData,
  signedInClient,
  sql,
  type Db,
} from "./harness";
import { createBatch, createCustomer, createProduct, createSupplier, daysAgo, recordSale } from "./fixtures";

const POOLED_STATEMENT_TIMEOUT = "1500ms";

const CHAT_VIEWS = [
  "v_chat_batches",
  "v_chat_stock_lines",
  "v_chat_sales",
  "v_chat_customers",
  "v_chat_kpis",
  "v_chat_products",
  "v_chat_suppliers",
];

describe("chat_query: a member's SELECT over the chat views, read-only", () => {
  let operator: Db;
  let admin: Db;
  let stranger: Db;
  let batchIds: string[];

  beforeAll(async () => {
    await ensureTestUsers();
    operator = await signedInClient("operator");
    admin = await signedInClient("admin");
    stranger = await signedInClient("stranger");
  });

  beforeEach(async () => {
    await resetDomainData();
    const productId = await createProduct(operator, { name: "Black Pearl", abbreviation: "BP" });
    const supplierId = await createSupplier(operator, "Madurai Quarry");
    const customerId = await createCustomer(operator, { name: "Sri Balaji Granites", phone: "+91 98765 43210" });
    const first = await createBatch(operator, { productId, supplierId, units: 10 });
    const second = await createBatch(operator, {
      productId,
      supplierId,
      units: 4,
      length: 5,
      breadth: 3,
      thickness: 20,
    });
    await createBatch(operator, { productId, supplierId, units: 2, length: 6, breadth: 3, thickness: 20 });
    batchIds = [first.data?.id ?? "", second.data?.id ?? ""];
    expect((await recordSale(operator, { batchId: batchIds[0], customerId })).error).toBeNull();
  });

  async function rows(db: Db, q: string): Promise<Record<string, unknown>[]> {
    const { data, error } = await db.rpc("chat_query", { q });
    if (error) throw error;
    return data as Record<string, unknown>[];
  }

  async function counts(): Promise<{ customers: number; sales: number }> {
    const [row] = await sql<{ customers: string; sales: string }>(
      `select (select count(*) from public.customers) as customers, (select count(*) from public.sales) as sales`,
    );
    return { customers: Number(row.customers), sales: Number(row.sales) };
  }

  describe("who can call it", () => {
    it("returns the rows to a member, refuses a stranger, and refuses anon", async () => {
      const [{ count }] = await sql<{ count: string }>(`select count(*) from public.batches`);
      expect(Number(count)).toBe(3);

      for (const member of [operator, admin]) {
        expect(await rows(member, "select count(*) as n from v_chat_batches")).toEqual([{ n: 3 }]);
      }
      for (const view of CHAT_VIEWS) {
        const refused = await stranger.rpc("chat_query", { q: `select count(*) as n from ${view}` });
        expect(expectError(refused).message, view).toMatch(/team members/i);
        expect((await rows(operator, `select count(*) as n from ${view}`))[0].n, view).toBeGreaterThan(0);
      }

      const denied = await anonClient().rpc("chat_query", { q: "select 1 as one" });
      expect(denied.error?.message).toMatch(/permission denied/i);
    });

    it("keeps the chat views out of reach of a direct read", async () => {
      for (const view of CHAT_VIEWS) {
        expect(
          (
            await anonClient()
              .from(view as never)
              .select("*")
          ).error?.message,
        ).toMatch(/permission denied/i);
        expect((await operator.from(view as never).select("*")).error?.message).toMatch(/permission denied/i);
      }
    });

    it("marks every chat view security_barrier so a query cannot read past the member filter", async () => {
      const found = await sql<{ relname: string; reloptions: string[] | null }>(
        `select relname, reloptions from pg_class where relname like 'v\\_chat\\_%' order by relname`,
      );
      expect(found.map((v) => v.relname)).toEqual([...CHAT_VIEWS].sort());
      for (const v of found) expect(v.reloptions).toContain("security_barrier=true");
    });
  });

  describe("what the query can reach from the session", () => {
    let sessions: PgClient[];

    beforeEach(() => {
      sessions = [];
    });

    afterEach(async () => {
      await Promise.all(sessions.map((pg) => pg.end()));
    });

    async function connect(): Promise<PgClient> {
      const pg = new PgClient({ connectionString: dbUrl });
      await pg.connect();
      sessions.push(pg);
      return pg;
    }

    async function pooledSession(email = "operator@test.local") {
      const pg = await connect();
      async function call(q: string, as = email): Promise<unknown> {
        await pg.query("begin");
        try {
          await pg.query("set local role authenticated");
          await pg.query(
            `select set_config('request.jwt.claims', $1, true),
                    set_config('request.headers', $2, true),
                    set_config('statement_timeout', $3, true)`,
            [
              JSON.stringify({ email: as, role: "authenticated" }),
              JSON.stringify({ authorization: "Bearer member-token" }),
              POOLED_STATEMENT_TIMEOUT,
            ],
          );
          const { rows: result } = await pg.query("select public.chat_query($1) as r", [q]);
          await pg.query("commit");
          return result[0].r;
        } catch (error) {
          await pg.query("rollback");
          throw error;
        }
      }
      return { pg, call };
    }

    async function advisoryLocks(pg: PgClient): Promise<number> {
      const { rows: found } = await pg.query(
        `select count(*)::int as n from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()`,
      );
      return found[0].n;
    }

    it("refuses a stranger who forges a member's claims inside the query", async () => {
      const claims = `{"email":"operator@test.local"}`;
      for (const name of ["request.jwt.claims", "request.jwt.claim"]) {
        const q = `select n from (select set_config('${name}', '${claims}', true) as c offset 0) x
                   cross join lateral (select count(*) as n from v_chat_batches where x.c is not null) y`;
        const result = await stranger.rpc("chat_query", { q });
        expect(expectError(result).message, name).toMatch(/team members/i);
        expect(JSON.stringify(result), name).not.toMatch(/BP-/);
      }
    });

    it("keeps a member's bearer token and cookies out of the query", async () => {
      const [row] = await rows(
        operator,
        "select current_setting('request.headers', true) as headers, current_setting('request.cookies', true) as cookies",
      );
      expect(JSON.stringify(row)).not.toMatch(/authorization|bearer|eyJ/i);
    });

    it("hands the query only the member's email, not the rest of the token claims", async () => {
      const [row] = await rows(operator, "select current_setting('request.jwt.claims', true) as claims");
      expect(JSON.parse(String(row.claims))).toEqual({ email: "operator@test.local" });
    });

    it("releases session advisory locks when the call returns", async () => {
      const { pg, call } = await pooledSession();
      const takers = [
        "select pg_try_advisory_lock(424242) as got",
        "select pg_try_advisory_lock_shared(424243) as got",
        "select pg_try_advisory_lock(1, 2) as got",
        "select pg_advisory_lock(424244)",
      ];
      for (const q of takers) {
        await call(q);
        expect(await advisoryLocks(pg), q).toBe(0);
      }
    });

    it("releases session advisory locks when the query then fails or times out", async () => {
      const { pg, call } = await pooledSession();
      await expect(call("select pg_advisory_lock(424245), 1 / (random() * 0)")).rejects.toThrow(/division by zero/);
      expect(await advisoryLocks(pg)).toBe(0);
      await expect(call("select pg_advisory_lock(424246), pg_sleep(5)")).rejects.toThrow(/statement timeout/);
      expect(await advisoryLocks(pg)).toBe(0);
    });

    it("leaves no session-level setting behind on a pooled connection", async () => {
      const { pg, call } = await pooledSession();
      await call(
        `select set_config('request.jwt.claim', '{"email":"admin@test.local"}', false),
                set_config('search_path', 'pg_temp', false),
                set_config('chat.probe', 'left behind', false)`,
      );
      const { rows: after } = await pg.query(
        `select current_setting('request.jwt.claim', true) as claim,
                current_setting('search_path') as path,
                current_setting('chat.probe', true) as probe`,
      );
      expect(after[0].claim ?? "").toBe("");
      expect(after[0].path).not.toBe("pg_temp");
      expect(after[0].probe ?? "").toBe("");
    });

    it("cannot turn the next request on the same connection into a member", async () => {
      const { call } = await pooledSession();
      await call(`select set_config('request.jwt.claim', '{"email":"admin@test.local"}', false)`);
      await expect(call("select 1 as one", "stranger@test.local")).rejects.toThrow(/team members/i);
    });

    it("sends no notification", async () => {
      const listener = await connect();
      await listener.query("listen chat_probe");
      const heard: string[] = [];
      listener.on("notification", (message) => heard.push(message.channel));
      const { call } = await pooledSession();
      await call("select pg_notify('chat_probe', 'hello')");
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(heard).toEqual([]);
    });

    it("cannot lift the statement timeout from inside the query", async () => {
      const { call } = await pooledSession();
      await expect(call("select set_config('statement_timeout', '0', true), pg_sleep(5)")).rejects.toThrow(
        /statement timeout/,
      );
    });
  });

  describe("writes", () => {
    it("refuses a writable CTE and a stacked statement, leaving the data unchanged", async () => {
      const before = await counts();

      const cte = await operator.rpc("chat_query", {
        q: "with d as (insert into customers(name) values ('x') returning 1) select * from d",
      });
      expect(expectError(cte)).toBeTruthy();

      const stacked = await operator.rpc("chat_query", { q: "select 1; delete from sales" });
      expect(expectError(stacked)).toBeTruthy();

      const balanced = await operator.rpc("chat_query", {
        q: "select 1) s) x; delete from sales; select * from (select * from (select 1",
      });
      expect(expectError(balanced)).toBeTruthy();

      expect(await counts()).toEqual(before);
    });

    it("runs the query in a read-only transaction as the chat_reader role", async () => {
      expect(
        await rows(operator, "select current_setting('transaction_read_only') as ro, current_user as who"),
      ).toEqual([{ ro: "on", who: "chat_reader" }]);
    });

    it("cannot change role however set_config is spelled, so no query steps back out of chat_reader", async () => {
      const [customer] = await sql<{ id: string }>(
        `select id from public.customers where name = 'Sri Balaji Granites'`,
      );
      expect(customer).toBeDefined();
      const readCustomers = "query_to_xml('select name, phone from customers limit 2', true, false, '')::text as b";
      const spellings = [
        "select set_config('role', 'authenticated', true)",
        "select pg_catalog.set_config('role', 'service_role', true)",
        "select U&\"set\\005Fconfig\"('role', 'service_role', true)",
        "select SET_CONFIG('role', 'service_role', true)",
        "select set_config('session_authorization', 'postgres', true)",
        `select query_to_xml(concat('select set_', 'config(''role'',''authenticated'',true) as r'), true, false, '')::text as a, ${readCustomers}`,
        `select query_to_xml(format('select %s(''role'',''service_role'',true) as r', chr(115) || 'et_config'), true, false, '')::text as a, ${readCustomers}`,
        `select set_config('role', 'service_role', true), ${readCustomers}`,
      ];
      for (const q of spellings) {
        const result = await operator.rpc("chat_query", { q });
        expect(expectError(result).message, q).toMatch(/within security-definer function|permission denied/);
        const everything = JSON.stringify(result);
        expect(everything, q).not.toMatch(/Balaji|98765/);
      }
    });

    it("cannot switch the transaction back to read-write", async () => {
      const result = await operator.rpc("chat_query", { q: "select set_config('transaction_read_only', 'off', true)" });
      expect(expectError(result).message).toMatch(/read-write mode/);
    });
  });

  describe("what it can read", () => {
    it("refuses raw tables and views that hold names, phones or credentials", async () => {
      const blocked = [
        "select name from customers",
        "select * from v_sales",
        "select * from team_members",
        "select * from settings",
      ];
      for (const q of blocked) {
        const result = await operator.rpc("chat_query", { q });
        expect(expectError(result).message, q).toMatch(/permission denied/i);
      }
    });

    it("exposes no customer name or phone and no audit email column on any chat view", async () => {
      const columns = await sql<{ table_name: string; column_name: string }>(
        `select table_name, column_name from information_schema.columns
         where table_schema = 'public' and table_name like 'v\\_chat\\_%'`,
      );
      expect([...new Set(columns.map((c) => c.table_name))].sort()).toEqual([...CHAT_VIEWS].sort());

      const names = columns.map((c) => c.column_name);
      expect(names).not.toContain("created_by");
      expect(names).not.toContain("updated_by");
      expect(names).not.toContain("customer_name");
      expect(names).not.toContain("customer_phone");

      const customerColumns = columns.filter((c) => c.table_name === "v_chat_customers").map((c) => c.column_name);
      expect(customerColumns.filter((c) => /name|phone/.test(c))).toEqual([]);
      const saleColumns = columns.filter((c) => c.table_name === "v_chat_sales").map((c) => c.column_name);
      expect(saleColumns.filter((c) => /phone|^customer_name$/.test(c))).toEqual([]);
    });

    it("identifies customers by a C- alias built from the first six characters of the id", async () => {
      const [customer] = await sql<{ id: string }>(
        `select id from public.customers where name = 'Sri Balaji Granites'`,
      );
      const alias = `C-${customer.id.slice(0, 6)}`;

      const sales = await rows(operator, "select customer_alias, revenue from v_chat_sales");
      expect(sales).toEqual([{ customer_alias: alias, revenue: 1650 }]);

      const aliases = await rows(operator, "select customer_alias from v_chat_customers");
      expect(aliases.map((r) => r.customer_alias)).toContain(alias);
    });

    it("answers from every chat view for a member", async () => {
      for (const view of CHAT_VIEWS) {
        const result = await operator.rpc("chat_query", { q: `select * from ${view}` });
        expect(result.error, view).toBeNull();
      }
      expect((await rows(operator, "select product_name from v_chat_products"))[0]).toEqual({
        product_name: "Black Pearl",
      });
      expect((await rows(operator, "select supplier_name from v_chat_suppliers"))[0]).toEqual({
        supplier_name: "Madurai Quarry",
      });
    });
  });

  describe("the chat views agree with the views they mirror", () => {
    function without(row: Record<string, unknown>, dropped: readonly string[]): Record<string, unknown> {
      return Object.fromEntries(Object.entries(row).filter(([key]) => !dropped.includes(key)));
    }
    function byId(list: Record<string, unknown>[]): Record<string, unknown>[] {
      return [...list].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    }

    beforeEach(async () => {
      const [{ id: productId }] = await sql<{ id: string }>(`select id from public.products limit 1`);
      const [{ id: supplierId }] = await sql<{ id: string }>(`select id from public.suppliers limit 1`);
      const [{ id: customerId }] = await sql<{ id: string }>(`select id from public.customers where not is_walk_in`);
      const old = await createBatch(operator, {
        productId,
        supplierId,
        units: 6,
        purchaseDate: daysAgo(200),
        stackNumber: "2",
      });
      await recordSale(operator, {
        batchId: old.data?.id ?? "",
        customerId,
        quantity: 2,
        salePrice: 2000,
        stickering: { cost: 100, price: 150 },
      });
      await sql(`update public.settings set ageing_after_days = 90, stale_after_days = 180`);
      await operator.rpc("archive_batch", { p_batch_id: batchIds[1] });
    });

    it("v_chat_batches matches v_yard_batches on every column it keeps", async () => {
      const source = await operator.from("v_yard_batches").select("*");
      const expected = (source.data ?? []).map((r) => without(r, ["notes", "created_by", "updated_by"]));
      const actual = (await rows(operator, "select * from v_chat_batches")).map((r) => without(r, ["total_cost"]));
      expect(byId(actual)).toEqual(byId(expected));
      expect(new Set(actual.map((r) => r.ageing_band))).toEqual(new Set(["FRESH", "STALE"]));
    });

    it("v_chat_batches total_cost matches v_batches on sized and unsized batches", async () => {
      const source = await operator.from("v_batches").select("id, total_cost");
      const actual = await rows(operator, "select id, total_cost from v_chat_batches");
      expect(actual.length).toBeGreaterThan(0);
      expect(byId(actual)).toEqual(byId(source.data ?? []));
    });

    it("v_chat_sales matches v_sales on every column it keeps", async () => {
      const source = await operator.from("v_sales").select("*");
      const dropped = ["notes", "created_by", "updated_by", "customer_name", "customer_phone"];
      const expected = (source.data ?? []).map((r) => without(r, dropped));
      const actual = (await rows(operator, "select * from v_chat_sales")).map((r) => without(r, ["customer_alias"]));
      expect(expected).toHaveLength(2);
      expect(byId(actual)).toEqual(byId(expected));
    });

    it("v_chat_stock_lines matches v_stock_lines", async () => {
      const source = await operator.from("v_stock_lines").select("*");
      const key = (r: Record<string, unknown>) => String(r.line_key);
      const sorted = (list: Record<string, unknown>[]) => [...list].sort((a, b) => key(a).localeCompare(key(b)));
      expect(sorted(await rows(operator, "select * from v_chat_stock_lines"))).toEqual(sorted(source.data ?? []));
    });

    it("v_chat_kpis matches v_dashboard_kpis", async () => {
      const source = await operator.from("v_dashboard_kpis").select("*").single();
      expect(await rows(operator, "select * from v_chat_kpis")).toEqual([source.data]);
    });
  });

  describe("row limit", () => {
    it("returns at most 500 rows", async () => {
      expect(await rows(operator, "select generate_series(1, 2000) as i")).toHaveLength(500);
    });
  });
});
