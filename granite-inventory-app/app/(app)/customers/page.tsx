import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { AddCustomerButton } from "./add-customer-button";
import { CustomersView } from "./customers-view";

/* A static shell: the list comes from the browser cache. */
export default function CustomersPage() {
  return (
    <>
      <PageHeader title="Customers" actions={<AddCustomerButton />} />
      <Suspense>
        <CustomersView />
      </Suspense>
    </>
  );
}
