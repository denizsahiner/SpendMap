"use client"
import dynamic from "next/dynamic"

const SpendMapContainer = dynamic(
  () => import("@/components/spend-map/spend-map-container").then((m) => m.SpendMapContainer),
  { ssr: false }
)

export default function Home() {
  return <SpendMapContainer />
}
