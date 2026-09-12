type Props = {
  readonly title?: string;
};

export function PageLoading({ title }: Props) {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-7">
      {title ? (
        <div aria-hidden="true" className="text-2xl font-bold tracking-tight md:text-[26px]">
          {title}
        </div>
      ) : (
        <div className="h-8 w-40 rounded-md bg-muted" />
      )}
      <div className="h-48 rounded-card bg-card shadow-sm" />
      <div className="h-64 rounded-card bg-card shadow-sm" />
    </div>
  );
}
