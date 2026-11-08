import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { AlertItem } from "./AlertFeed";
import AlertTimeline from "./AlertTimeline";

const T0 = Date.parse("2026-11-03T12:00:00.000Z");

export function alert(over: Partial<AlertItem> = {}): AlertItem {
  return {
    id: Math.random().toString(36).slice(2), timestamp: new Date(T0).toISOString(), last_seen: new Date(T0).toISOString(),
    src_ip: "10.0.0.9", dst_ip: "10.0.0.1", src_port: 40000, dst_port: 80, protocol: "TCP", attack_type: "PortScan",
    confidence: 1, severity: "low", source: "rule", count: 1, batch_id: null, acknowledged_at: null, suppressed_by: null, ...over,
  };
}

test("timeline: a bar per busy minute, and clicking one focuses the feed on it", () => {
  const onFocus = vi.fn();
  render(<AlertTimeline alerts={[alert({ severity: "high" }), alert()]} clock={T0 + 30_000} capture={false} focus={null} onFocus={onFocus} />);
  const bar = screen.getByRole("button", { name: /2 new \(1 High, 0 Medium, 1 Low\)/ });
  expect(screen.getByText(/from the 2 alerts in this view/)).toBeTruthy();
  fireEvent.click(bar);
  expect(onFocus).toHaveBeenCalledWith(expect.objectContaining({ kind: "minute", start: T0, end: T0 + 60_000 }));
});

test("timeline: says so when the hour is empty", () => {
  render(<AlertTimeline alerts={[]} clock={T0} capture={false} focus={null} onFocus={() => {}} />);
  expect(screen.getByText("No alerts in the last hour.")).toBeTruthy();
});
