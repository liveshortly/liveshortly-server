import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { sessionTitle } from "@/lib/api";
import { loadPublicSession } from "@/lib/publicSession";
import ReplayClient from "./ReplayClient";

// Server-rendered like /session/[id] (LSW-15): open sessions are in the HTML;
// anything needing sign-in renders client-side with the visitor's cookie.
// This fetch counts the view — the client only refetches when it got nothing.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const s = await loadPublicSession((await params).id, true);
  return { title: s && s !== "missing" ? `Replay · ${sessionTitle(s)}` : "Session replay" };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const s = await loadPublicSession(id, true);
  if (s === "missing") notFound();
  return <ReplayClient id={id} initial={s} />;
}
