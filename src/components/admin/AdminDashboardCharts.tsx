'use client';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { AdminChartData } from '@/lib/actions/admin';

interface Props {
  data: AdminChartData;
}

// Tailwind colors via raw hex (recharts doesn't read CSS vars cleanly).
// Pulled from the existing palette used elsewhere in the app.
const COLOR_STUDENT = '#dc2626';   // red-600 (brand)
const COLOR_TEACHER = '#f59e0b';   // amber-500
const COLOR_CLASS = '#6366f1';     // indigo-500
const TRACK_COLORS = ['#dc2626', '#f59e0b', '#0ea5e9', '#10b981', '#a855f7'];

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function AdminDashboardCharts({ data }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Signups over time — full width on its own row */}
      <ChartCard
        title="Signups — last 30 days"
        subtitle="New students and teachers per day"
        className="lg:col-span-2"
      >
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart
            data={data.signupsDaily}
            margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
          >
            <defs>
              <linearGradient id="gradStudents" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR_STUDENT} stopOpacity={0.35} />
                <stop offset="100%" stopColor={COLOR_STUDENT} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradTeachers" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLOR_TEACHER} stopOpacity={0.35} />
                <stop offset="100%" stopColor={COLOR_TEACHER} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              stroke="#9ca3af"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              minTickGap={20}
            />
            <YAxis
              stroke="#9ca3af"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              labelFormatter={(label) => shortDate(label as string)}
              contentStyle={{
                borderRadius: 8,
                border: '1px solid #e5e7eb',
                fontSize: 12,
              }}
            />
            <Legend
              iconType="circle"
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            />
            <Area
              type="monotone"
              dataKey="students"
              stroke={COLOR_STUDENT}
              fill="url(#gradStudents)"
              strokeWidth={2}
              name="Students"
            />
            <Area
              type="monotone"
              dataKey="teachers"
              stroke={COLOR_TEACHER}
              fill="url(#gradTeachers)"
              strokeWidth={2}
              name="Teachers"
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Class creation over time */}
      <ChartCard
        title="Classes created — last 30 days"
        subtitle="New classes per day"
      >
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={data.classCreationDaily}
            margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              stroke="#9ca3af"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              minTickGap={20}
            />
            <YAxis
              stroke="#9ca3af"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              labelFormatter={(label) => shortDate(label as string)}
              contentStyle={{
                borderRadius: 8,
                border: '1px solid #e5e7eb',
                fontSize: 12,
              }}
            />
            <Bar
              dataKey="classes"
              fill={COLOR_CLASS}
              radius={[4, 4, 0, 0]}
              name="Classes"
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Track distribution */}
      <ChartCard
        title="Track distribution"
        subtitle="Students across tracks"
      >
        {data.trackDistribution.length === 0 ? (
          <p className="flex h-[220px] items-center justify-center text-sm italic text-gray-500">
            No students enrolled in any track yet.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={data.trackDistribution}
                dataKey="count"
                nameKey="track"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={80}
                paddingAngle={2}
              >
                {data.trackDistribution.map((_, i) => (
                  <Cell
                    key={i}
                    fill={TRACK_COLORS[i % TRACK_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  fontSize: 12,
                }}
              />
              <Legend
                iconType="circle"
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white p-5 shadow-sm ${
        className ?? ''
      }`}
    >
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}