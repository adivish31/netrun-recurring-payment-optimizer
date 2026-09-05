/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, react/no-unescaped-entities */
import CockpitClient from './CockpitClient';
import Link from 'next/link';

async function fetchJson(endpoint: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:3000'}/api/${endpoint}`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${endpoint}: ${res.statusText}`);
  }
  return res.json();
}

export default async function DashboardPage() {
  let results, cycles, rules, grid;
  try {
    results = await fetchJson('results');
    cycles = await fetchJson('cycles');
    rules = await fetchJson('rules');
    grid = await fetchJson('grid');
  } catch (error: any) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] p-12">
        <h1 className="text-2xl font-bold mb-4">Error loading data</h1>
        <p className="text-red-600 font-mono text-sm">{error.message}</p>
        <p className="mt-4 text-sm">Please ensure the backend API (npm run dev) is running on port 3000.</p>
      </div>
    );
  }

  return (
    <CockpitClient initialData={{ results, cycles, rules, grid, traces: {} }} />
  );
}
