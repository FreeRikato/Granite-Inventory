import { Client as PgClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canWrite, ROLES } from "@/lib/domain";
import { PRODUCT_IMAGE_BUCKET, productImageUrl } from "@/lib/product-images";
import {
  createBatch,
  createCustomer,
  createProduct,
  createSupplier,
  daysAgo,
  recordBill,
  recordSale,
  today,
} from "./fixtures";
import {
  anonClient,
  dbUrl,
  ensureTestUsers,
  expectError,
  resetDomainData,
  serviceClient,
  signedInClient,
  sql,
  TEST_USERS,
  type Db,
} from "./harness";

const VIEWER_REFUSAL = "A Viewer cannot change anything";
const ADMIN_REFUSAL = "Only an Admin can make corrections";

const READ_ONLY_VOLATILE_FUNCTIONS = ["chat_query"];

type Fixture = {
  productId: string;
  supplierId: string;
  batchId: string;
  customerId: string;
  saleId: string;
  billId: string;
  receiptId: string;
};

type WritePath = {
  readonly refusal: string;
  readonly args: (f: Fixture) => Record<string, unknown>;
};

const sized = (f: Fixture) => ({
  p_product_id: f.productId,
  p_variant_name: "Standard",
  p_supplier_id: f.supplierId,
  p_purchase_date: daysAgo(5),
  p_length_ft: 4,
  p_breadth_ft: 2,
  p_thickness_mm: 16,
  p_initial_units: 3,
  p_unit_purchase_price: 100,
  p_stack_number: "7",
});

const WRITE_FUNCTIONS: Record<string, WritePath> = {
  create_batch: { refusal: VIEWER_REFUSAL, args: sized },
  record_sale: {
    refusal: VIEWER_REFUSAL,
    args: (f) => ({
      p_batch_id: f.batchId,
      p_customer_id: f.customerId,
      p_sale_date: today(),
      p_quantity: 1,
      p_sale_rate: 200,
      p_payment_mode: "CASH",
    }),
  },
  record_bill: {
    refusal: VIEWER_REFUSAL,
    args: (f) => ({
      p_customer_id: f.customerId,
      p_sale_date: today(),
      p_payments: [{ payment_mode: "CASH" }],
      p_lines: [{ batch_id: f.batchId, quantity: 1, sale_rate: 200 }],
    }),
  },
  record_credit_payment: {
    refusal: VIEWER_REFUSAL,
    args: (f) => ({
      p_bill_id: f.billId,
      p_paid_on: today(),
      p_payments: [{ payment_mode: "UPI", amount: 10 }],
    }),
  },
  extend_pay_by: {
    refusal: VIEWER_REFUSAL,
    args: (f) => ({ p_bill_id: f.billId, p_pay_by: "2099-01-01" }),
  },
  correct_batch: {
    refusal: ADMIN_REFUSAL,
    args: (f) => ({ ...sized(f), p_batch_id: f.batchId }),
  },
  archive_batch: { refusal: ADMIN_REFUSAL, args: (f) => ({ p_batch_id: f.batchId, p_archived: true }) },
  delete_batch: { refusal: ADMIN_REFUSAL, args: (f) => ({ p_batch_id: f.batchId }) },
  correct_sale: {
    refusal: ADMIN_REFUSAL,
    args: (f) => ({
      p_sale_id: f.saleId,
      p_batch_id: f.batchId,
      p_customer_id: f.customerId,
      p_sale_date: today(),
      p_quantity: 1,
      p_sale_rate: 300,
      p_payment_mode: "CASH",
    }),
  },
  delete_sale: { refusal: ADMIN_REFUSAL, args: (f) => ({ p_sale_id: f.saleId }) },
  delete_bill: { refusal: ADMIN_REFUSAL, args: (f) => ({ p_bill_id: f.billId }) },
  correct_credit_payment: {
    refusal: ADMIN_REFUSAL,
    args: (f) => ({
      p_payment_id: f.receiptId,
      p_paid_on: today(),
      p_payments: [{ payment_mode: "UPI", amount: 5 }],
    }),
  },
  delete_credit_payment: { refusal: ADMIN_REFUSAL, args: (f) => ({ p_payment_id: f.receiptId }) },
};

const READ_FUNCTIONS: Record<string, Record<string, unknown>> = {
  ageing_band: { p_age_days: 10 },
  daily_summary: { p_date: today() },
  fast_moving: { p_days: 90, p_limit: 5 },
  margin_by_period: { p_grain: "month" },
  payments_by_mode: { p_range: "month" },
  received_by_period: { p_range: "month" },
  suggest_slot: { p_category: "GRANITE", p_length_ft: 4 },
  top_customers: { p_window: "all" },
};

async function fingerprint(): Promise<Record<string, string>> {
  const tables = await sql<{ table_name: string }>(
    `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
  );
  const prints: Record<string, string> = {};
  for (const { table_name: name } of tables) {
    const [row] = await sql<{ print: string | null }>(
      `select md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as print from public.${name} t`,
    );
    prints[name] = row?.print ?? "";
  }
  return prints;
}

async function writableRelations(): Promise<{ name: string; column: string }[]> {
  return sql<{ name: string; column: string }>(
    `select c.relname as name, (
       select a.attname from pg_attribute a
       where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped order by a.attnum limit 1
     ) as column
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'v')
       and (c.relkind = 'r' or pg_relation_is_updatable(c.oid::regclass, false) > 0)
       and has_table_privilege('authenticated', c.oid, 'insert, update, delete')
     order by 1`,
  );
}

describe("viewer: reads everything, writes nothing", () => {
  let admin: Db;
  let operator: Db;
  let viewer: Db;
  let fixture: Fixture;
  let before: Record<string, string>;

  beforeAll(async () => {
    await ensureTestUsers();
    await resetDomainData();
    admin = await signedInClient("admin");
    operator = await signedInClient("operator");
    viewer = await signedInClient("viewer");

    const productId = await createProduct(operator, { name: "Black Pearl", abbreviation: "BP" });
    const supplierId = await createSupplier(operator, "Madurai Quarry");
    const customerId = await createCustomer(operator, { name: "Sri Balaji", phone: "9876543210" });
    const batch = await createBatch(operator, { productId, supplierId, units: 20, purchaseDate: daysAgo(30) });
    const batchId = batch.data?.id ?? "";
    const sale = await recordSale(operator, { batchId, customerId, saleRate: 300 });
    const bill = await recordBill(operator, {
      customerId,
      onCredit: true,
      payments: [{ payment_mode: "CASH", amount: 100 }],
      lines: [{ batchId, quantity: 2, saleRate: 300 }],
    });
    const billData = bill.data as { bill: { id: string }; sales: { id: string }[] };
    const receipt = await operator.rpc("record_credit_payment", {
      p_bill_id: billData.bill.id,
      p_paid_on: today(),
      p_payments: [{ payment_mode: "UPI", amount: 50 }],
    });
    fixture = {
      productId,
      supplierId,
      batchId,
      customerId,
      saleId: sale.data?.id ?? "",
      billId: billData.bill.id,
      receiptId: receipt.data ?? "",
    };
    before = await fingerprint();
  });

  afterAll(async () => {
    await ensureTestUsers();
    await resetDomainData();
  });

  describe("every write path is refused in words", () => {
    it("the walk covers every volatile function an authenticated caller can run", async () => {
      const rows = await sql<{ proname: string }>(
        `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.prokind = 'f' and p.provolatile = 'v'
           and has_function_privilege('authenticated', p.oid, 'execute')
           and p.prorettype <> 'trigger'::regtype
         order by 1`,
      );
      expect(rows.map((r) => r.proname)).toEqual(
        [...Object.keys(WRITE_FUNCTIONS), ...READ_ONLY_VOLATILE_FUNCTIONS].sort(),
      );
    });

    it.each(Object.entries(WRITE_FUNCTIONS))("%s", async (name, path) => {
      const result = await (viewer.rpc as unknown as (fn: string, args: unknown) => PromiseLike<{ error: unknown }>)(
        name,
        path.args(fixture),
      );
      expect(expectError(result)).toMatchObject({ message: path.refusal });
      expect(await fingerprint()).toEqual(before);
    });

    it("a direct insert, update and delete on every writable table and view is refused", async () => {
      const relations = await writableRelations();
      expect(relations.map((r) => r.name)).toEqual(expect.arrayContaining(["customers", "settings", "team_members"]));
      const db = viewer as unknown as {
        from(name: string): {
          insert(row: object): PromiseLike<{ error: { message: string } | null }>;
          update(row: object): {
            not(c: string, op: string, v: null): PromiseLike<{ error: { message: string } | null }>;
          };
          delete(): { not(c: string, op: string, v: null): PromiseLike<{ error: { message: string } | null }> };
        };
      };
      const outcomes: Record<string, string | undefined> = {};
      for (const { name, column } of relations) {
        outcomes[`insert ${name}`] = (await db.from(name).insert({})).error?.message;
        outcomes[`update ${name}`] = (
          await db
            .from(name)
            .update({ [column]: null })
            .not(column, "is", null)
        ).error?.message;
        outcomes[`delete ${name}`] = (await db.from(name).delete().not(column, "is", null)).error?.message;
      }
      expect(outcomes).toEqual(Object.fromEntries(Object.keys(outcomes).map((key) => [key, VIEWER_REFUSAL])));
      expect(await fingerprint()).toEqual(before);
    });

    it("cannot edit a Customer through the app's own update", async () => {
      const result = await viewer.from("customers").update({ name: "Renamed" }).eq("id", fixture.customerId).select();
      expect(expectError(result)).toMatchObject({ message: VIEWER_REFUSAL });
    });

    it("a security definer function gated only by is_member still cannot write any table", async () => {
      const tables = await sql<{ table_name: string }>(
        `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
      );
      const pg = new PgClient({ connectionString: dbUrl });
      await pg.connect();
      const allowed: string[] = [];
      try {
        await pg.query("begin");
        await pg.query(`
          create function public.sibling_write(q text) returns void language plpgsql security definer set search_path = '' as $$
          begin
            if not public.is_member() then raise exception 'Not a team member'; end if;
            execute q;
          end $$`);
        await pg.query("grant execute on function public.sibling_write(text) to authenticated");
        await pg.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({ role: "authenticated", email: TEST_USERS.viewer.email }),
        ]);
        await pg.query("set local role authenticated");
        for (const { table_name: name } of tables) {
          const statements = [
            `insert into public.${name} default values`,
            `update public.${name} set ${await firstColumn(name)} = ${await firstColumn(name)} where false`,
            `delete from public.${name} where false`,
          ];
          for (const statement of statements) {
            await pg.query("savepoint probe");
            try {
              await pg.query("select public.sibling_write($1)", [statement]);
              allowed.push(statement);
            } catch (error) {
              if (!(error instanceof Error) || error.message !== VIEWER_REFUSAL) allowed.push(`${statement}: ${error}`);
            }
            await pg.query("rollback to savepoint probe");
          }
        }
      } finally {
        await pg.query("rollback");
        await pg.end();
      }
      expect(allowed).toEqual([]);
    });

    it("no write function gates on is_member", async () => {
      const rows = await sql<{ proname: string }>(
        `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.provolatile = 'v' and p.prosrc like '%is_member()%'
         order by 1`,
      );
      expect(rows.map((r) => r.proname)).toEqual(READ_ONLY_VOLATILE_FUNCTIONS);
    });

    it("no insert or update policy lets a mere member through", async () => {
      const rows = await sql<{ policyname: string }>(
        `select policyname from pg_policies
         where schemaname in ('public', 'storage') and cmd <> 'SELECT'
           and (coalesce(qual, '') like '%is_member%' or coalesce(with_check, '') like '%is_member%')`,
      );
      expect(rows).toEqual([]);
    });

    it("no table can be truncated by anon or authenticated, which neither RLS nor refuse_viewer would stop", async () => {
      const rows = await sql<{ relname: string }>(
        `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r', 'v')
           and (has_table_privilege('authenticated', c.oid, 'truncate') or has_table_privilege('anon', c.oid, 'truncate'))`,
      );
      expect(rows).toEqual([]);
    });

    it("cannot upload, replace or delete a product image", async () => {
      const file = new Blob(["x"], { type: "image/png" });
      const imagePath = `${fixture.productId}/viewer-test.png`;
      expect((await admin.storage.from(PRODUCT_IMAGE_BUCKET).upload(imagePath, file)).error).toBeNull();
      try {
        const bucket = viewer.storage.from(PRODUCT_IMAGE_BUCKET);
        expect((await bucket.upload(`${fixture.productId}/other.png`, file)).error).not.toBeNull();
        expect((await bucket.update(imagePath, new Blob(["y"], { type: "image/png" }))).error).not.toBeNull();
        await bucket.remove([imagePath]);
        expect((await fetch(productImageUrl(imagePath))).ok).toBe(true);
      } finally {
        await admin.storage.from(PRODUCT_IMAGE_BUCKET).remove([imagePath]);
      }
    });
  });

  describe("the public views take no writes from anyone", () => {
    it.each(["viewer", "operator", "stranger"] as const)(
      "%s cannot change settings through v_public_business",
      async (who) => {
        const db = await signedInClient(who);
        expectError(await db.from("v_public_business").update({ tagline: "changed" }).neq("tagline", ""));
        expectError(await db.from("v_public_business").delete().neq("tagline", ""));
        const [row] = await sql<{ tagline: string }>(`select tagline from public.settings`);
        expect(row?.tagline).not.toBe("changed");
      },
    );

    it("anon is refused by the grant, not by a later accident, on insert, update and delete", async () => {
      const anon = anonClient();
      const denied = { message: "permission denied for view v_public_business" };
      const view = anon.from("v_public_business");
      expect(expectError(await view.insert({ tagline: "changed" }))).toMatchObject(denied);
      expect(expectError(await view.update({ tagline: "changed" }).neq("tagline", ""))).toMatchObject(denied);
      expect(expectError(await view.delete().neq("tagline", ""))).toMatchObject(denied);
      const rows = await sql<{ tagline: string }>(`select tagline from public.settings`);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.tagline).not.toBe("changed");
    });

    it("no view that bypasses RLS is writable by anon or authenticated", async () => {
      const rows = await sql<{ relname: string }>(
        `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'v'
           and not coalesce(c.reloptions::text[] && array['security_invoker=true', 'security_invoker=on'], false)
           and (has_table_privilege('authenticated', c.oid, 'insert, update, delete, truncate')
             or has_table_privilege('anon', c.oid, 'insert, update, delete, truncate'))`,
      );
      expect(rows).toEqual([]);
    });
  });

  describe("reads", () => {
    it("sees exactly what an Admin sees on every table and view", async () => {
      const relations = await sql<{ relname: string }>(
        `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r', 'v') and has_table_privilege('authenticated', c.oid, 'select')
         order by 1`,
      );
      expect(relations.length).toBeGreaterThan(20);
      const read = async (db: Db, name: string) => {
        const { data, error } = await (
          db as unknown as {
            from(n: string): { select(c: string): PromiseLike<{ data: unknown[] | null; error: unknown }> };
          }
        )
          .from(name)
          .select("*");
        expect(error).toBeNull();
        return (data ?? []).map((row) => JSON.stringify(row)).sort();
      };
      for (const { relname } of relations) {
        expect(await read(viewer, relname), relname).toEqual(await read(admin, relname));
      }
      for (const name of ["batches", "sales", "bills", "credit_payments", "v_credit", "team_members"]) {
        expect((await read(viewer, name)).length, name).toBeGreaterThan(0);
      }
    });

    it("sees Landed Cost and Margin", async () => {
      const sales = await viewer.from("v_sales").select("landed_cost, margin").eq("id", fixture.saleId).single();
      expect(sales.error).toBeNull();
      expect(sales.data?.landed_cost).toBeGreaterThan(0);
      expect(sales.data?.margin).not.toBeNull();
    });

    it.each(Object.entries(READ_FUNCTIONS))("runs %s", async (name, args) => {
      const result = await (viewer.rpc as unknown as (fn: string, args: unknown) => PromiseLike<{ error: unknown }>)(
        name,
        args,
      );
      expect(result.error).toBeNull();
    });

    it("previews a Batch Code", async () => {
      const { data, error } = await viewer.rpc("preview_batch_code", {
        p_product_id: fixture.productId,
        p_date: today(),
      });
      expect(error).toBeNull();
      expect(data).toMatch(/^BP-/);
    });
  });

  describe("chat", () => {
    it("answers a Viewer's question", async () => {
      const { data, error } = await viewer.rpc("chat_query", { q: "select count(*) as sales from v_chat_sales" });
      expect(error).toBeNull();
      expect(data).toEqual([{ sales: 2 }]);
    });

    it("cannot be used to write", async () => {
      const insert = await viewer.rpc("chat_query", {
        q: "with d as (insert into customers(name) values ('x') returning 1) select * from d",
      });
      expect(insert.error).not.toBeNull();
      const write = await viewer.rpc("chat_query", {
        q: `select public.delete_bill('${fixture.billId}')`,
      });
      expect(write.error).not.toBeNull();
      expect(await fingerprint()).toEqual(before);
    });
  });

  describe("assigning the Role", () => {
    const friend = "friend@test.local";

    it("an Admin adds a Viewer and changes the Role back", async () => {
      const added = await admin.from("team_members").insert({ email: friend, role: "VIEWER" }).select().single();
      expect(added.error).toBeNull();
      const changed = await admin
        .from("team_members")
        .update({ role: "YARD_OPERATOR" })
        .eq("email", friend)
        .select()
        .single();
      expect(changed.data?.role).toBe("YARD_OPERATOR");
      await admin.from("team_members").delete().eq("email", friend);
    });

    it("a Viewer cannot change their own Role", async () => {
      const result = await viewer.from("team_members").update({ role: "ADMIN" }).eq("email", TEST_USERS.viewer.email);
      expect(expectError(result)).toMatchObject({ message: VIEWER_REFUSAL });
      const [row] = await sql<{ role: string }>(`select role from public.team_members where email = $1`, [
        TEST_USERS.viewer.email,
      ]);
      expect(row?.role).toBe("VIEWER");
    });

    it("a Yard Operator cannot make anyone a Viewer", async () => {
      const result = await operator
        .from("team_members")
        .update({ role: "VIEWER" })
        .eq("email", TEST_USERS.admin.email)
        .select();
      expect(result.data).toEqual([]);
      const [row] = await sql<{ role: string }>(`select role from public.team_members where email = $1`, [
        TEST_USERS.admin.email,
      ]);
      expect(row?.role).toBe("ADMIN");
    });

    it("the UI and the database agree on which Roles write", async () => {
      try {
        for (const role of ROLES) {
          await sql(`update public.team_members set role = $1 where email = $2`, [role, TEST_USERS.viewer.email]);
          expect((await viewer.rpc("can_write")).data, role).toBe(canWrite(role));
        }
      } finally {
        await sql(`update public.team_members set role = 'VIEWER' where email = $1`, [TEST_USERS.viewer.email]);
      }
    });

    it("an unknown Role is still refused", async () => {
      expectError(await admin.from("team_members").insert({ email: friend, role: "READER" }));
    });

    async function withOnlyTestAdmin(run: () => Promise<void>): Promise<void> {
      const removed = await sql<{ email: string; name: string | null }>(
        `delete from public.team_members where role = 'ADMIN' and email <> $1 returning email, name`,
        [TEST_USERS.admin.email],
      );
      try {
        await run();
      } finally {
        await sql(`update public.team_members set role = 'ADMIN' where email = $1`, [TEST_USERS.admin.email]);
        for (const { email, name } of removed) {
          await sql(`insert into public.team_members (email, name, role) values ($1, $2, 'ADMIN')`, [email, name]);
        }
        await sql(`delete from public.team_members where email = $1`, [friend]);
      }
    }

    it("the last Admin cannot be demoted to Viewer", async () => {
      await withOnlyTestAdmin(async () => {
        const result = await admin.from("team_members").update({ role: "VIEWER" }).eq("email", TEST_USERS.admin.email);
        expect(expectError(result)).toMatchObject({ message: "At least one Admin must remain" });
      });
    });

    it("two Admins demoting each other at once still leave one Admin", async () => {
      await withOnlyTestAdmin(async () => {
        await sql(`insert into public.team_members (email, role) values ($1, 'ADMIN')`, [friend]);
        const first = new PgClient({ connectionString: dbUrl });
        const second = new PgClient({ connectionString: dbUrl });
        await Promise.all([first.connect(), second.connect()]);
        try {
          const demote = `update public.team_members set role = 'VIEWER' where email = $1`;
          await first.query("begin");
          await second.query("begin");
          await first.query(demote, [TEST_USERS.admin.email]);
          const racing = second.query(demote, [friend]).then(
            () => "demoted",
            (error: unknown) => (error instanceof Error ? error.message : "failed"),
          );
          await new Promise((resolve) => setTimeout(resolve, 200));
          await first.query("commit");
          expect(await racing).toBe("At least one Admin must remain");
        } finally {
          await first.query("rollback");
          await second.query("rollback");
          await Promise.all([first.end(), second.end()]);
        }
      });
    });

    it("a former Viewer can write again once promoted", async () => {
      await sql(`update public.team_members set role = 'YARD_OPERATOR' where email = $1`, [TEST_USERS.viewer.email]);
      try {
        expect(
          (await viewer.from("customers").update({ name: "Sri Balaji" }).eq("id", fixture.customerId)).error,
        ).toBeNull();
      } finally {
        await sql(`update public.team_members set role = 'VIEWER' where email = $1`, [TEST_USERS.viewer.email]);
      }
    });
  });

  it("service role and migrations are not treated as a Viewer", async () => {
    const { error } = await serviceClient().from("customers").update({ phone: null }).eq("id", fixture.customerId);
    expect(error).toBeNull();
  });
});

async function firstColumn(table: string): Promise<string> {
  const [row] = await sql<{ column_name: string }>(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = $1 and is_generated = 'NEVER' and is_identity = 'NO'
     order by ordinal_position limit 1`,
    [table],
  );
  return row?.column_name ?? "";
}
