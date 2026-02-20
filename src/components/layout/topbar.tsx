"use client";

export function Topbar() {
  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4 md:px-6">
      <div className="md:hidden font-semibold">bzrcMaster</div>
      <div className="flex-1" />
      <div className="text-sm text-muted-foreground">Shipping Module</div>
    </header>
  );
}
