/* eslint-disable @typescript-eslint/no-explicit-any */
import CockpitClient from './CockpitClient';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000';

async function fetchJson(endpoint: string) {
  const res = await fetch(`${API_BASE}/api/${endpoint}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${endpoint}: ${res.statusText}`);
  }
  return res.json();
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // ?tab=pipeline opens straight onto a tab, so a demo can be linked to a
  // specific view instead of clicking through. searchParams is a Promise here.
  const params = await searchParams;
  const rawTab = params?.tab;
  const initialTab = typeof rawTab === 'string' ? rawTab : undefined;
  const rawCycle = params?.cycle;
  const initialCycleId = typeof rawCycle === 'string' ? rawCycle : undefined;

  let results, cycles, rules, grid, traces, cycleTraces;
  try {
    // Traces are fetched here, not in a client effect, so the first paint
    // already has a selected trace. An empty first render is what made the
    // Agent / Pipeline / Decision tabs look broken.
    [results, cycles, rules, grid, traces, cycleTraces] = await Promise.all([
      fetchJson('results'),
      fetchJson('cycles'),
      fetchJson('rules'),
      fetchJson('grid'),
      fetchJson('agent/traces'),
      fetchJson('cycle-traces'),
    ]);
  } catch (error: any) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] p-12">
        <h1 className="text-2xl font-bold mb-4">Error loading data</h1>
        <p className="text-red-600 font-mono text-sm">{error.message}</p>
        <p className="mt-4 text-sm">
          Please ensure the backend API (npm run dev) is running on port 3000.
        </p>
      </div>
    );
  }

  return (
    <CockpitClient
      initialTab={initialTab}
      initialCycleId={initialCycleId}
      initialData={{
        results,
        cycles,
        rules,
        grid,
        traces: traces?.traces || [],
        cycleTraces: cycleTraces || {},
      }}
    />
  );
}
