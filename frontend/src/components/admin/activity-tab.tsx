'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { useState } from 'react';
import { Bone, cx, ErrorState, errorMessage } from '@/components/csmju/primitives';
import { api } from '@/lib/csmju/api';
import { METRIC_LABELS, niceMax, shortDate, trendText } from './admin-format';
import { ACTIVITY_METRICS, type ActivityMetric, type ActivityPoint, type ActivityTrend, type AdminActivity } from './admin-types';

const RANGES = [7, 30, 90] as const;

type Range = (typeof RANGES)[number];

/// แท็บ "กิจกรรม" — การเคลื่อนไหวของเว็บเป็นยอดรวมรายวัน (ไม่มีข้อมูลรายบุคคล)
export function ActivityTab() {
  const [days, setDays] = useState<Range>(7);
  const [metric, setMetric] = useState<ActivityMetric>('designsCreated');
  const query = useQuery({
    queryKey: ['admin-activity', days],
    queryFn: () => api.get<AdminActivity>(`/admin-activity?days=${days}`),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="flex flex-col gap-6">
      <div role="radiogroup" aria-label="ช่วงเวลา" className="flex flex-wrap gap-2">
        {RANGES.map((range) => (
          <button
            key={range}
            type="button"
            role="radio"
            aria-checked={days === range}
            onClick={() => setDays(range)}
            className={cx(
              'min-h-11 rounded-full border px-4 text-csmju-caption font-medium transition-colors',
              days === range ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong bg-surface text-ink hover:bg-surface-muted',
            )}
          >
            {range} วัน
          </button>
        ))}
      </div>

      {query.isPending ? (
        <ActivitySkeleton />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <TrendSummary data={query.data} metric={metric} onSelect={setMetric} />
          <section aria-labelledby="activity-chart-heading" className="rounded-2xl border border-line bg-surface p-4">
            <h2 id="activity-chart-heading" className="text-csmju-h3 font-semibold text-ink">
              {METRIC_LABELS[metric]} รายวัน
            </h2>
            <p className="text-csmju-caption text-muted">
              {shortDate(query.data.from)} – {shortDate(query.data.to)} · เวลาไทย · เลือกตัวชี้วัดได้จากการ์ดด้านบน
            </p>
            <BarChart series={query.data.series} metric={metric} />
            <DataTable series={query.data.series} />
          </section>
        </>
      )}
    </div>
  );
}

function TrendSummary({
  data,
  metric,
  onSelect,
}: {
  data: AdminActivity;
  metric: ActivityMetric;
  onSelect: (metric: ActivityMetric) => void;
}) {
  const quiet = data.trends.every((t) => t.current === 0 && t.previous === 0);

  return (
    <section aria-labelledby="activity-trend-heading">
      <h2 id="activity-trend-heading" className="text-csmju-h3 font-semibold text-ink">
        เทรนด์
      </h2>
      <p className="text-csmju-caption text-muted">
        {quiet ? `ยังไม่มีความเคลื่อนไหวใน ${data.days * 2} วันที่ผ่านมา` : `เทียบ ${data.days} วันนี้กับ ${data.days} วันก่อนหน้า`}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {data.trends.map((trend) => (
          <button
            key={trend.metric}
            type="button"
            aria-pressed={metric === trend.metric}
            onClick={() => onSelect(trend.metric)}
            className={cx(
              'flex flex-col items-start rounded-2xl border px-4 py-3 text-left transition-colors',
              metric === trend.metric ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:bg-surface-muted',
            )}
          >
            <span className="text-csmju-caption text-muted">{METRIC_LABELS[trend.metric]}</span>
            <span className="text-csmju-h2 font-bold text-ink tabular-nums">{trend.current.toLocaleString('th-TH')}</span>
            <TrendBadge trend={trend} />
          </button>
        ))}
      </div>
    </section>
  );
}

function TrendBadge({ trend }: { trend: ActivityTrend }) {
  const Icon = trend.direction === 'UP' ? ArrowUpRight : trend.direction === 'DOWN' ? ArrowDownRight : ArrowRight;

  return (
    <span
      className={cx(
        'mt-1 inline-flex items-center gap-1 text-csmju-caption',
        trend.direction === 'UP' ? 'text-success' : trend.direction === 'DOWN' ? 'text-danger' : 'text-muted',
      )}
    >
      <Icon aria-hidden className="size-4" />
      {trendText(trend)}
      <span className="text-muted">(ก่อนหน้า {trend.previous.toLocaleString('th-TH')})</span>
    </span>
  );
}

const CHART_W = 600;
const CHART_H = 200;

/// กราฟแท่งด้วย SVG ล้วน (ไม่ใช้ไลบรารีชาร์ต) · ป้ายแกนเป็น HTML ให้ตัวอักษรไม่เล็กกว่า 14px บนมือถือ
function BarChart({ series, metric }: { series: ActivityPoint[]; metric: ActivityMetric }) {
  const values = series.map((p) => p[metric]);
  const max = niceMax(Math.max(0, ...values));
  const total = values.reduce((sum, v) => sum + v, 0);
  const slot = CHART_W / Math.max(1, series.length);
  const barWidth = Math.max(1, slot * 0.7);
  const mid = series[Math.floor(series.length / 2)];

  return (
    <div className="mt-4">
      <div className="flex gap-2">
        <div className="flex h-56 flex-col justify-between text-right text-csmju-caption text-muted tabular-nums" aria-hidden>
          <span>{max.toLocaleString('th-TH')}</span>
          <span>{(max / 2).toLocaleString('th-TH')}</span>
          <span>0</span>
        </div>
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${METRIC_LABELS[metric]} ${series.length} วัน รวม ${total.toLocaleString('th-TH')} สูงสุดต่อวัน ${Math.max(0, ...values).toLocaleString('th-TH')}`}
          className="h-56 min-w-0 flex-1"
        >
          {[0, 0.5, 1].map((t) => (
            <line
              key={t}
              x1={0}
              x2={CHART_W}
              y1={CHART_H * t}
              y2={CHART_H * t}
              className="stroke-line"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {series.map((point, i) => {
            const value = point[metric];
            const height = (value / max) * CHART_H;

            return (
              <rect
                key={point.date}
                x={i * slot + (slot - barWidth) / 2}
                y={CHART_H - height}
                width={barWidth}
                height={height}
                rx={Math.min(3, barWidth / 4)}
                className="fill-chart-1"
              >
                <title>{`${shortDate(point.date)}: ${value.toLocaleString('th-TH')}`}</title>
              </rect>
            );
          })}
        </svg>
      </div>
      {series.length > 0 && (
        <div className="mt-1 flex justify-between pl-8 text-csmju-caption text-muted" aria-hidden>
          <span>{shortDate(series[0].date)}</span>
          {mid && series.length > 2 && <span>{shortDate(mid.date)}</span>}
          <span>{shortDate(series[series.length - 1].date)}</span>
        </div>
      )}
    </div>
  );
}

/// ตัวเลขดิบของทุกวัน — สำหรับโปรแกรมอ่านหน้าจอและคนที่อยากเห็นตัวเลขตรง ๆ
function DataTable({ series }: { series: ActivityPoint[] }) {
  return (
    <details className="mt-4">
      <summary className="min-h-11 cursor-pointer py-2 text-csmju-caption font-medium text-primary">ดูตัวเลขรายวันเป็นตาราง</summary>
      <div className="mt-2 max-h-96 overflow-auto rounded-xl border border-line">
        <table className="w-full text-left text-csmju-caption">
          <thead className="sticky top-0 bg-surface-muted text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">วันที่</th>
              {ACTIVITY_METRICS.map((m) => (
                <th key={m} scope="col" className="px-3 py-2 font-medium">
                  {METRIC_LABELS[m]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {[...series].reverse().map((point) => (
              <tr key={point.date}>
                <th scope="row" className="px-3 py-2 font-medium whitespace-nowrap text-ink">
                  {shortDate(point.date)}
                </th>
                {ACTIVITY_METRICS.map((m) => (
                  <td key={m} className="px-3 py-2 tabular-nums text-body">
                    {point[m].toLocaleString('th-TH')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function ActivitySkeleton() {
  return (
    <div role="status" aria-label="กำลังโหลดกิจกรรม" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="rounded-2xl border border-line bg-surface px-4 py-3">
            <Bone className="h-3.5 w-24" />
            <Bone className="mt-2 h-7 w-16" />
          </div>
        ))}
      </div>
      <Bone className="h-64 w-full rounded-2xl" />
    </div>
  );
}
