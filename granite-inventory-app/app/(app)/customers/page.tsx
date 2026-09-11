import { PageHeader } from "@/components/shell/page-header";
import { createClient } from "@/lib/supabase/server";
import { AddCustomerButton } from "./add-customer-button";
import { CustomerList } from "./customer-list";

export default async function CustomersPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("v_customers").select("*").order("name");
  const customers = data ?? [];
  const contractors = customers.filter((c) => c.customer_type === "CONTRACTOR").length;
  const trusts = customers.filter((c) => c.customer_type === "TRUST").length;

  return (
    <>
      <PageHeader title="Customers" actions={<AddCustomerButton />} />
      <CustomerList
        customers={customers}
        kpis={[
          { label: "Total Customers", value: customers.length },
          { label: "Contractors", value: contractors },
          { label: "Trusts", value: trusts },
        ]}
      />
    </>
  );
}
