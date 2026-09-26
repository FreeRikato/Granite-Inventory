"use client";

import { useQuery } from "@tanstack/react-query";
import { DataAge } from "@/components/data-age";
import { ViewError, ViewSkeleton } from "@/components/view-state";
import { useHydrated } from "@/lib/query/provider";
import { customerListQuery } from "@/lib/query/reads";
import { CustomerList } from "./customer-list";

export function CustomersView() {
  const hydrated = useHydrated();
  const list = useQuery(customerListQuery);

  if (!hydrated || !list.isSuccess) {
    if (list.isError) return <ViewError what="the customers" message={list.error.message} />;
    return <ViewSkeleton />;
  }

  const customers = list.data;
  const contractors = customers.filter((c) => c.customer_type === "CONTRACTOR").length;
  const trusts = customers.filter((c) => c.customer_type === "TRUST").length;

  return (
    <>
      <div className="-mt-4 flex justify-end">
        <DataAge updatedAt={list.dataUpdatedAt} fetching={list.isFetching} />
      </div>
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
