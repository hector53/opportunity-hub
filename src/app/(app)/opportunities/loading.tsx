export default function Loading() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Cargando">
      <div className="h-7 w-48 rounded bg-surface-2" />
      <div className="h-14 rounded-lg bg-surface" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-12 rounded bg-surface" />
      ))}
    </div>
  );
}
