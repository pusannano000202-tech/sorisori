export default function Loading() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-12">
      <div className="glass-panel w-full max-w-3xl rounded-[2rem] p-10">
        <div className="h-4 w-28 rounded-full bg-[rgba(20,36,61,0.12)]" />
        <div className="mt-4 h-14 w-full max-w-2xl rounded-[1.2rem] bg-[rgba(20,36,61,0.08)]" />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-36 rounded-[1.5rem] bg-[rgba(255,255,255,0.58)]"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
