import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App, { upsert } from "./App";
import type { AlertItem } from "./components/AlertFeed";

const alert = (id: string, batch_id: number | null, count = 1) => ({ id, batch_id, count }) as AlertItem;

test("an update replaces the old copy and moves to the top", () => {
  const list = upsert([alert("a", null), alert("b", null)], [alert("b", null, 2)]);
  expect(list.map((a) => [a.id, a.count])).toEqual([["b", 2], ["a", 1]]);
});

test("live alerts never evict an upload's alerts", () => {
  const upload = Array.from({ length: 1000 }, (_, i) => alert(`u${i}`, 1));
  const live = Array.from({ length: 1500 }, (_, i) => alert(`l${i}`, null));
  const list = upsert(upsert([], upload), live);
  expect(list.filter((a) => a.batch_id === 1)).toHaveLength(1000);
  expect(list.filter((a) => a.batch_id === null)).toHaveLength(1000);
});

/** A backend double: lists for /suppressions and /uploads, an alert page for everything else. */
function api(extra: Record<string, unknown> = {}) {
  return vi.fn(async (url: string) => {
    const path = new URL(String(url)).pathname;
    const body = path === "/suppressions" || path === "/uploads" ? (extra[path] ?? []) : { items: [], model_loaded: true };
    return { status: 200, ok: true, json: async () => body };
  });
}
const alertCalls = (mock: ReturnType<typeof api>) => mock.mock.calls.filter(([url]) => new URL(String(url)).pathname === "/alerts");

class FakeWS {
  static last: FakeWS;
  static count = 0;
  protocols: string[];
  onopen?: () => void;
  onmessage?: (e: { data: string }) => void;
  onclose?: () => void;
  constructor(_url: string, protocols: string[]) {
    this.protocols = protocols;
    FakeWS.last = this;
    FakeWS.count++;
  }
  close() {}
}

beforeEach(() => {
  localStorage.clear();
  FakeWS.count = 0;
  vi.stubGlobal("WebSocket", FakeWS);
});
afterEach(() => vi.unstubAllGlobals());

test("asks for the token when none is stored", () => {
  vi.stubGlobal("fetch", vi.fn());
  render(<App />);
  expect(screen.getByText("Paste the dashboard token")).toBeTruthy();
});

test("sends the stored token to the WebSocket and the REST API", async () => {
  localStorage.setItem("sentinelstream.token", "t0k");
  const fetchMock = api();
  vi.stubGlobal("fetch", fetchMock);
  render(<App />);
  expect(FakeWS.last.protocols).toEqual(["sentinelstream", "t0k"]);
  act(() => FakeWS.last.onopen?.());
  await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes("/alerts") && init?.headers?.Authorization === "Bearer t0k")).toBe(true));
});

test("a rejected token brings back the form even though the socket never opens", async () => {
  localStorage.setItem("sentinelstream.token", "old");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 401, ok: false, json: async () => ({}) }));
  render(<App />);
  await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/rejected that token/));
  expect(await screen.findByText("Waiting for the dashboard token")).toBeTruthy(); // the pill updates in the next render
});

test("each failed reconnect probes /alerts again", async () => {
  localStorage.setItem("sentinelstream.token", "t0k");
  const fetchMock = api();
  vi.stubGlobal("fetch", fetchMock);
  render(<App />);
  await waitFor(() => expect(alertCalls(fetchMock)).toHaveLength(1));
  act(() => FakeWS.last.onclose?.());
  await waitFor(() => expect(alertCalls(fetchMock)).toHaveLength(2));
});

test("without a token the header waits for one and no socket is opened", () => {
  vi.stubGlobal("fetch", vi.fn());
  render(<App />);
  expect(screen.getByText("Waiting for the dashboard token")).toBeTruthy();
  expect(screen.queryByText(/Lost the connection/)).toBeNull();
  expect(FakeWS.count).toBe(0);
});

test("saving a valid token stores it and opens the socket with it", async () => {
  const fetchMock = api();
  vi.stubGlobal("fetch", fetchMock);
  render(<App />);
  fireEvent.change(screen.getByLabelText("Dashboard token"), { target: { value: " abc_DEF-123 " } });
  fireEvent.click(screen.getByText("Save"));
  expect(localStorage.getItem("sentinelstream.token")).toBe("abc_DEF-123");
  expect(FakeWS.last.protocols).toEqual(["sentinelstream", "abc_DEF-123"]);
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
});

test("a malformed pasted token is not saved", () => {
  vi.stubGlobal("fetch", vi.fn());
  render(<App />);
  fireEvent.change(screen.getByLabelText("Dashboard token"), { target: { value: "Bearer abc" } });
  fireEvent.click(screen.getByText("Save"));
  expect(screen.getByRole("alert").textContent).toBe("That doesn't look like a dashboard token.");
  expect(localStorage.getItem("sentinelstream.token")).toBeNull();
  expect(FakeWS.count).toBe(0);
});

test("a malformed stored token yields the form, not a crash", () => {
  localStorage.setItem("sentinelstream.token", "bad token\n");
  vi.stubGlobal("fetch", vi.fn());
  render(<App />);
  expect(screen.getByText("Paste the dashboard token")).toBeTruthy();
  expect(FakeWS.count).toBe(0);
});

const liveAlert = (over: Partial<AlertItem>) =>
  ({ acknowledged_at: null, suppressed_by: null,
    id: "x1", timestamp: new Date().toISOString(), last_seen: new Date().toISOString(), src_ip: "127.0.0.1", dst_ip: "127.0.0.1",
    src_port: 40000, dst_port: 20, protocol: "TCP", attack_type: "PortScan", confidence: 1, severity: "high", source: "rule",
    count: 1, batch_id: null, ...over,
  }) as AlertItem;

test("a new High alert is announced, held as New, and counted in the tab title", async () => {
  localStorage.setItem("sentinelstream.token", "t0k");
  vi.stubGlobal("fetch", api());
  render(<App />);
  act(() => FakeWS.last.onmessage?.({ data: JSON.stringify({ type: "alert", data: liveAlert({}) }) }));
  await waitFor(() => expect(screen.getByText("New High alert: PortScan from 127.0.0.1")).toBeTruthy());
  expect(screen.getByText("New")).toBeTruthy();
  expect(document.title).toBe("(1 High) SentinelStream");
  expect(screen.getByRole("heading", { name: "High in effect" })).toBeTruthy(); // the ink band raises the warning
});

test("switching to an upload's tab clears the filters, so a stale filter can't hide its alerts", async () => {
  localStorage.setItem("sentinelstream.token", "t0k");
  vi.stubGlobal("fetch", api());
  render(<App />);
  act(() => FakeWS.last.onmessage?.({ data: JSON.stringify({ type: "batch", data: { batch_id: 7, status: "done" } }) }));
  fireEvent.change(screen.getByLabelText("Severity"), { target: { value: "high" } });
  fireEvent.click(screen.getByRole("tab", { name: "Upload 7" }));
  expect((screen.getByLabelText("Severity") as HTMLSelectElement).value).toBe("all");
  expect(screen.getByText("In this capture")).toBeTruthy();
});

test("one shared focus: talkers, then map, then the chip's remove button", async () => {
  localStorage.setItem("sentinelstream.token", "t0k");
  vi.stubGlobal("fetch", api());
  render(<App />);
  act(() => {
    for (const [id, src_ip, dst_port] of [["f1", "10.0.0.1", 22], ["f2", "10.0.0.2", 80]] as const) {
      FakeWS.last.onmessage?.({ data: JSON.stringify({ type: "alert", data: liveAlert({ id, src_ip, dst_port }) }) });
    }
  });
  const rows = () => document.querySelectorAll("[data-alert]").length;
  await waitFor(() => expect(rows()).toBe(2));
  fireEvent.click(screen.getAllByRole("button", { name: /^10\.0\.0\.1 1 detection/ })[0]);
  expect(rows()).toBe(1);
  expect(screen.getByRole("button", { name: "Remove filter 10.0.0.1" })).toBeTruthy();
  fireEvent.click(screen.getAllByRole("button", { name: /^:80 1 detection|^80 1 detection|^port 80 1 detection/ })[0]);
  expect(screen.queryByRole("button", { name: "Remove filter 10.0.0.1" })).toBeNull();
  expect(rows()).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: /^Remove filter/ }));
  expect(rows()).toBe(2);
  expect(screen.queryByRole("button", { name: /^Remove filter/ })).toBeNull();
});
