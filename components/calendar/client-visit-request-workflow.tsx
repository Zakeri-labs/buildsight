"use client"

import { useEffect, useMemo, useState } from "react"

import { ClientVisitRequestDialog } from "@/components/calendar/client-visit-request-dialog"
import { ScheduleSiteVisitDialog } from "@/components/calendar/schedule-site-visit-dialog"
import type {
  CalendarClientRequestViewModel,
  CalendarSchedulingProjectViewModel,
} from "@/lib/calendar/types"
import { localDateInputValue } from "@/lib/site-visits/format"

export function ClientVisitRequestWorkflow({
  request,
  open,
  onOpenChange,
  schedulingProjects,
  onScheduled,
  onRefreshRequired,
}: {
  request: CalendarClientRequestViewModel | null
  open: boolean
  onOpenChange: (open: boolean) => void
  schedulingProjects: CalendarSchedulingProjectViewModel[]
  onScheduled: () => Promise<void> | void
  onRefreshRequired: () => Promise<void> | void
}) {
  const [scheduleOpen, setScheduleOpen] = useState(false)

  useEffect(() => {
    setScheduleOpen(false)
  }, [request?.id])

  const requestProjects = useMemo(
    () => request
      ? schedulingProjects.filter((project) => project.id === request.projectId)
      : [],
    [request, schedulingProjects],
  )

  function approveRequest(selectedRequest: CalendarClientRequestViewModel) {
    if (!selectedRequest.canManage || !selectedRequest.canApprove || !requestProjects.length) return
    onOpenChange(false)
    setScheduleOpen(true)
  }

  async function handleScheduled() {
    setScheduleOpen(false)
    onOpenChange(false)
    await onScheduled()
  }

  async function handleRefreshRequired() {
    setScheduleOpen(false)
    onOpenChange(false)
    await onRefreshRequired()
  }

  return (
    <>
      <ClientVisitRequestDialog
        request={request}
        open={open}
        onOpenChange={onOpenChange}
        onApprove={approveRequest}
      />

      {request && request.canApprove && requestProjects.length ? (
        <ScheduleSiteVisitDialog
          open={scheduleOpen}
          onOpenChange={setScheduleOpen}
          projects={requestProjects}
          initialDate={request.requestedDate ?? localDateInputValue()}
          request={request}
          onScheduled={handleScheduled}
          onRefreshRequired={handleRefreshRequired}
        />
      ) : null}
    </>
  )
}
