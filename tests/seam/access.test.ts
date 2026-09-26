import { beforeAll, describe, expect, it } from "vitest";
import { anonClient, ensureTestUsers, expectError, signedInClient, sql } from "./harness";

describe("access: team members and settings", () => {
  beforeAll(async () => {
    await ensureTestUsers();
  });

  it("anon reads nothing from team_members or settings", async () => {
    const anon = anonClient();
    const members = await anon.from("team_members").select("email");
    const settings = await anon.from("settings").select("business_name");
    expect(members.data).toEqual([]);
    expect(settings.data).toEqual([]);
  });

  it("anon can read the public business view only", async () => {
    const anon = anonClient();
    const { data, error } = await anon.from("v_public_business").select("*").single();
    expect(error).toBeNull();
    expect(data?.business_name).toBe("Kirthik Granite");
    expect(Object.keys(data ?? {}).sort()).toEqual(
      ["business_name", "catalog_public", "tagline", "whatsapp_number"].sort(),
    );
  });

  it("a signed-in stranger sees no rows and cannot promote themselves", async () => {
    const stranger = await signedInClient("stranger");
    const members = await stranger.from("team_members").select("email");
    expect(members.data).toEqual([]);
    const insert = await stranger
      .from("team_members")
      .insert({ email: "stranger@test.local", role: "ADMIN" });
    expectError(insert);
    const rows = await sql(`select 1 from public.team_members where email = 'stranger@test.local'`);
    expect(rows).toHaveLength(0);
  });

  it("operator reads members and settings but cannot change them", async () => {
    const operator = await signedInClient("operator");
    const members = await operator.from("team_members").select("email");
    expect(members.data?.map((m) => m.email)).toContain("admin@test.local");
    const update = await operator
      .from("settings")
      .update({ stale_after_days: 200 })
      .eq("id", true)
      .select();
    expect(update.data).toEqual([]);
    const insert = await operator
      .from("team_members")
      .insert({ email: "friend@test.local", role: "YARD_OPERATOR" });
    expectError(insert);
  });

  it("admin manages members and settings, and cannot remove the last admin", async () => {
    const admin = await signedInClient("admin");
    const insert = await admin
      .from("team_members")
      .insert({ email: "meena@test.local", name: "Meena", role: "YARD_OPERATOR" })
      .select()
      .single();
    expect(insert.error).toBeNull();

    const update = await admin
      .from("settings")
      .update({ ageing_after_days: 120 })
      .eq("id", true)
      .select()
      .single();
    expect(update.data?.ageing_after_days).toBe(120);
    expect(update.data?.updated_by).toBe("admin@test.local");

    const badThreshold = await admin
      .from("settings")
      .update({ stale_after_days: 100 })
      .eq("id", true);
    expectError(badThreshold);

    await admin.from("team_members").delete().eq("email", "meena@test.local");
    await sql(`update public.settings set ageing_after_days = 90`);

    // Leave only the test admin as ADMIN, then try to delete it.
    await sql(`delete from public.team_members where role = 'ADMIN' and email <> 'admin@test.local'`);
    const del = await admin.from("team_members").delete().eq("email", "admin@test.local").select();
    expectError(del);
    await sql(`insert into public.team_members (email, name, role) values ('aravinthanrc@gmail.com', 'Aravinthan', 'ADMIN') on conflict do nothing`);
  });

  it("removed member loses access on the next request", async () => {
    const operator = await signedInClient("operator");
    await sql(`delete from public.team_members where email = 'operator@test.local'`);
    const after = await operator.from("settings").select("business_name");
    expect(after.data).toEqual([]);
    await ensureTestUsers();
  });
});
