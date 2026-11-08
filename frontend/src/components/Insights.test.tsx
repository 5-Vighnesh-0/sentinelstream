import { fireEvent, render, screen } from "@testing-library/react";
import gsap from "gsap";
import { afterEach, expect, test, vi } from "vitest";
import type { AlertItem } from "./AlertFeed";
import AlertTimeline from "./AlertTimeline";
import AttackMap from "./AttackMap";
import TopTalkers from "./TopTalkers";

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

test("map: one button per source and service, +N more past eight, and a click focuses the feed", () => {
  const onFocus = vi.fn();
  const alerts = Array.from({ length: 10 }, (_, i) => alert({ src_ip: `10.0.0.${i + 1}`, count: 10 - i }));
  render(<AttackMap alerts={alerts} clock={T0 + 1_000} capture={false} focus={null} onFocus={onFocus} />);
  expect(screen.getByText("+2 more")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^10\.0\.0\.1 / }));
  expect(onFocus).toHaveBeenCalledWith({ kind: "source", value: "10.0.0.1", label: "10.0.0.1" });
  fireEvent.click(screen.getByRole("button", { name: /^10\.0\.0\.1:80 / }));
  expect(onFocus).toHaveBeenCalledWith({ kind: "service", value: "10.0.0.1:80", label: "10.0.0.1:80" });
});

test("map: says so when there is nothing to map", () => {
  render(<AttackMap alerts={[]} clock={T0} capture={false} focus={null} onFocus={() => {}} />);
  expect(screen.getByText("No attacks to map yet.")).toBeTruthy();
});

afterEach(() => vi.restoreAllMocks());

const pair = (n: number, over: Partial<AlertItem> = {}) => alert({ src_ip: `10.0.0.${n}`, ...over });

test("map: one stroke per pair, toned by whether a High is in effect", () => {
  const old = new Date(T0 - 60_000).toISOString();
  const { container } = render(<AttackMap alerts={[pair(1, { severity: "high" }), pair(2, { last_seen: old, timestamp: old })]} clock={T0 + 1_000} capture={false} focus={null} onFocus={() => {}} />);
  const paths = container.querySelectorAll("path[data-link]");
  expect(paths.length).toBe(2);
  expect(container.querySelector('path[data-link^="10.0.0.1|"]')!.getAttribute("class")).toContain("stroke-sev-high");
  expect(container.querySelector('path[data-link^="10.0.0.2|"]')!.getAttribute("class")).toContain("stroke-edge");
});

test("map: stroke width is linear in detections", () => {
  const { container } = render(<AttackMap alerts={[pair(1, { count: 4 }), pair(2, { count: 1 })]} clock={T0} capture={false} focus={null} onFocus={() => {}} />);
  expect(container.querySelector('path[data-link^="10.0.0.1|"]')!.getAttribute("stroke-width")).toBe("4");
  expect(container.querySelector('path[data-link^="10.0.0.2|"]')!.getAttribute("stroke-width")).toBe("1");
});

test("map: only new links draw in", () => {
  const fromTo = vi.spyOn(gsap, "fromTo").mockReturnValue({} as gsap.core.Tween);
  const first = pair(1);
  const props = { clock: T0, capture: false, focus: null, onFocus: () => {} };
  const { container, rerender } = render(<AttackMap alerts={[first]} {...props} />);
  rerender(<AttackMap alerts={[first, pair(2)]} {...props} />);
  expect(fromTo).toHaveBeenCalledTimes(2);
  const targets = fromTo.mock.calls[1][0] as Element[];
  expect(targets.length).toBe(1);
  expect(targets[0]).toBe(container.querySelector('path[data-link^="10.0.0.2|"]'));
});

test("map: reduced motion draws nothing", () => {
  const fromTo = vi.spyOn(gsap, "fromTo");
  const original = window.matchMedia;
  window.matchMedia = ((q: string) => ({ matches: q === "(prefers-reduced-motion: reduce)", media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  try {
    render(<AttackMap alerts={[pair(1)]} clock={T0} capture={false} focus={null} onFocus={() => {}} />);
    expect(fromTo).not.toHaveBeenCalled();
  } finally {
    window.matchMedia = original;
  }
});

test("map: more than eight services says +1 more on the right", () => {
  const alerts = Array.from({ length: 9 }, (_, i) => alert({ dst_port: 1000 + i }));
  render(<AttackMap alerts={alerts} clock={T0} capture={false} focus={null} onFocus={() => {}} />);
  expect(screen.getByText("+1 more")).toBeTruthy();
});

test("talkers: ranked sources and ports; a click focuses the feed", () => {
  const onFocus = vi.fn();
  render(<TopTalkers alerts={[alert({ count: 4 }), alert({ src_ip: "10.0.0.5", dst_port: 443 })]} focus={null} onFocus={onFocus} />);
  fireEvent.click(screen.getByRole("button", { name: /^port 443 / }));
  expect(onFocus).toHaveBeenCalledWith({ kind: "port", value: "443", label: "port 443" });
  expect(screen.getByRole("button", { name: /^10\.0\.0\.9 4 detections/ })).toBeTruthy();
});

test("talkers: clicking the selected talker clears the focus", () => {
  const onFocus = vi.fn();
  render(<TopTalkers alerts={[alert()]} focus={{ kind: "source", value: "10.0.0.9", label: "10.0.0.9" }} onFocus={onFocus} />);
  const button = screen.getByRole("button", { name: /^10\.0\.0\.9 / });
  expect(button.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(button);
  expect(onFocus).toHaveBeenCalledWith(null);
});

test("talkers: says so when there are no detections", () => {
  render(<TopTalkers alerts={[]} focus={null} onFocus={() => {}} />);
  expect(screen.getByText("No detections in this view yet.")).toBeTruthy();
});
