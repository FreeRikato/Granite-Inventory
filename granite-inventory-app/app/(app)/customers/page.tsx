import { PageHeader } from "@/components/shell/page-header";
import { createClient } from "@/lib/supabase/server";
import { CustomerList } from "./customer-list";

export default async function CustomersPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("v_customers").select("*").order("name");
  const customers = data ?? [];
  const contractors = customers.filter((c) => c.customer_type === "CONTRACTOR").length;
  const regulars = customers.filter((c) => c.customer_type === "REGULAR" || c.customer_type === "TRUST").length;

  return (
    <>
      <CustomerList
        customers={customers}
        header={<PageHeader title="Customers" />}
        kpis={[
          { label: "Total Customers", value: customers.length },
          { label: "Contractors", value: contractors },
          { label: "Regular / Trusts", value: regulars },
        ]}
      />
    </>
  );
}
