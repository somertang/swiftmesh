import { useCallback, useEffect, useRef, useState } from 'react'
import type { Object3D } from 'three'
import {
  DecimateSession,
  EMPTY_DECIMATE_STATS,
  type DecimateStats,
} from './decimateSession'
import { exportObjectAsGlb, type ExportGltfResult } from './exportDecimatedGlb'
import { ratioFromPercent } from './decimateMath'

const APPLY_DEBOUNCE_MS = 50

export function useDecimateSession(root: Object3D | null, active: boolean) {
  const sessionRef = useRef<DecimateSession | null>(null)
  const ratioRef = useRef(1)
  const lockBorderRef = useRef(true)
  const applyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [percent, setPercentState] = useState(100)
  const [lockBorder, setLockBorderState] = useState(true)
  const [stats, setStats] = useState<DecimateStats>(EMPTY_DECIMATE_STATS)

  const applyNow = useCallback(async (session: DecimateSession) => {
    setStats(prev => ({ ...prev, phase: 'applying', error: null }))
    try {
      const next = await session.apply(ratioRef.current, lockBorderRef.current)
      setStats(next)
    } catch (error) {
      setStats(prev => ({
        ...prev,
        phase: 'error',
        error: error instanceof Error ? error.message : String(error),
      }))
    }
  }, [])

  const scheduleApply = useCallback(
    (session: DecimateSession) => {
      if (applyTimerRef.current) clearTimeout(applyTimerRef.current)
      applyTimerRef.current = setTimeout(() => {
        applyTimerRef.current = null
        void applyNow(session)
      }, APPLY_DEBOUNCE_MS)
    },
    [applyNow]
  )

  useEffect(() => {
    if (!active || !root) {
      sessionRef.current?.dispose()
      sessionRef.current = null
      setStats(EMPTY_DECIMATE_STATS)
      return
    }

    const session = new DecimateSession(root)
    sessionRef.current = session
    const base = session.baseStats()
    setStats({ ...base, phase: 'welding' })
    let cancelled = false

    void (async () => {
      try {
        await session.prepare((done, total) => {
          if (cancelled) return
          setStats(prev => ({ ...prev, phase: 'welding', weldDone: done, weldTotal: total }))
        })
        if (cancelled) return
        await applyNow(session)
      } catch (error) {
        if (cancelled) return
        setStats(prev => ({
          ...prev,
          phase: 'error',
          error: error instanceof Error ? error.message : String(error),
        }))
      }
    })()

    return () => {
      cancelled = true
      if (applyTimerRef.current) {
        clearTimeout(applyTimerRef.current)
        applyTimerRef.current = null
      }
      session.dispose()
      if (sessionRef.current === session) sessionRef.current = null
    }
  }, [active, root, applyNow])

  const setPercent = useCallback(
    (next: number) => {
      setPercentState(next)
      ratioRef.current = ratioFromPercent(next)
      const session = sessionRef.current
      if (session && stats.phase !== 'welding' && stats.phase !== 'idle') {
        scheduleApply(session)
      }
    },
    [scheduleApply, stats.phase]
  )

  const setLockBorder = useCallback(
    (next: boolean) => {
      setLockBorderState(next)
      lockBorderRef.current = next
      const session = sessionRef.current
      if (session && stats.phase !== 'welding' && stats.phase !== 'idle') {
        scheduleApply(session)
      }
    },
    [scheduleApply, stats.phase]
  )

  const exportGlb = useCallback(async (): Promise<ExportGltfResult> => {
    if (!root) throw new Error('No model root')
    return exportObjectAsGlb(root)
  }, [root])

  return {
    stats,
    percent,
    lockBorder,
    setPercent,
    setLockBorder,
    exportGlb,
  }
}
