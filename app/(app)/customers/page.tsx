import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { CustomersSkeleton } from "@/components/skeletons/customers-skeleton";
import { ViewSkeleton } from "@/components/view-state";
import { AddCustomerButton } from "./add-customer-button";
import { CustomersView } from "./customers-view";

const skeleton = (
  <ViewSkeleton>
    <CustomersSkeleton />
  </ViewSkeleton>
);

export default function CustomersPage() {
  return (
    <>
      <PageHeader title="Customers" actions={<AddCustomerButton />} />
      <Suspense fallback={skeleton}>
        <CustomersView skeleton={skeleton} />
      </Suspense>
    </>
  );
}
