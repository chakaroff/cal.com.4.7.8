"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { useMemo, useState, useCallback, useEffect } from "react";

import dayjs from "@calcom/dayjs";
import { Calendar } from "@calcom/features/calendars/weeklyview";
import type { CalendarEvent } from "@calcom/features/calendars/weeklyview/types/events";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { weekStartNum } from "@calcom/lib/weekstart";
import type { BookingStatus } from "@calcom/prisma/enums";
import { trpc } from "@calcom/trpc";
import {
  Badge,
  Button,
  ButtonGroup,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetClose,
} from "@calcom/ui";

const statusColorMap: Record<string, string> = {
  ACCEPTED: "#22c55e",
  PENDING: "#f59e0b",
  CANCELLED: "#ef4444",
  REJECTED: "#ef4444",
  AWAITING_HOST: "#8b5cf6",
};

const statusBadgeVariant: Record<string, "success" | "warning" | "error" | "default" | "orange"> = {
  ACCEPTED: "success",
  PENDING: "warning",
  CANCELLED: "error",
  REJECTED: "error",
  AWAITING_HOST: "default",
};

type BookingDetail = {
  id: number;
  uid: string;
  title: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  location: string | null;
  user: { id: number; name: string | null; email: string } | null;
  eventType: { title: string; slug: string; team: { name: string; slug: string | null } | null } | null;
  attendees: { name: string; email: string }[];
};

const AdminCalendarView = () => {
  const { t } = useLocale();
  const { data: me } = trpc.viewer.me.useQuery();

  /** Compute the Monday-based (default) start of this week */
  function getWeekRange(weekStart: number) {
    const now = dayjs();
    const currentDay = now.day(); // 0=Sun … 6=Sat
    const diff = (currentDay - weekStart + 7) % 7;
    const start = now.subtract(diff, "day").startOf("day").toDate();
    const end = dayjs(start).add(6, "day").endOf("day").toDate();
    return { start, end };
  }

  const [startDate, setStartDate] = useState<Date>(() => getWeekRange(1).start);
  const [endDate, setEndDate] = useState<Date>(() => getWeekRange(1).end);
  const [selectedBooking, setSelectedBooking] = useState<BookingDetail | null>(null);
  const [view, setView] = useState<"week" | "day">("week");

  // Once the user's weekStart preference loads, re-anchor the displayed week
  useEffect(() => {
    if (me?.weekStart) {
      const ws = weekStartNum(me.weekStart);
      const { start, end } = getWeekRange(ws);
      setStartDate(start);
      setEndDate(end);
    }
  }, [me?.weekStart]);

  const { data, isLoading } = trpc.viewer.admin.getAllBookings.useQuery(
    {
      afterStartDate: dayjs(startDate).startOf("day").toISOString(),
      beforeEndDate: dayjs(endDate).endOf("day").toISOString(),
      limit: 500,
    },
    {
      placeholderData: keepPreviousData,
    }
  );

  const calendarEvents: CalendarEvent[] = useMemo(() => {
    if (!data?.bookings) return [];
    return data.bookings.map((booking) => ({
      id: booking.id,
      title: `${booking.title}${booking.user?.name ? ` (${booking.user.name})` : ""}`,
      start: new Date(booking.startTime),
      end: new Date(booking.endTime),
      options: {
        status: booking.status as BookingStatus,
        borderColor: statusColorMap[booking.status] || undefined,
        className: "",
      },
    }));
  }, [data?.bookings]);

  const handleEventClick = useCallback(
    (event: CalendarEvent) => {
      const booking = data?.bookings.find((b) => b.id === event.id);
      if (booking) {
        setSelectedBooking(booking as unknown as BookingDetail);
      }
    },
    [data?.bookings]
  );

  const handleDateChange = useCallback(
    (newStartDate: Date, newEndDate?: Date) => {
      setStartDate(newStartDate);
      if (newEndDate) {
        setEndDate(newEndDate);
      } else {
        if (view === "week") {
          setEndDate(dayjs(newStartDate).add(6, "day").endOf("day").toDate());
        } else {
          setEndDate(dayjs(newStartDate).endOf("day").toDate());
        }
      }
    },
    [view]
  );

  const navigateWeek = useCallback(
    (direction: "prev" | "next") => {
      const delta = direction === "next" ? 7 : -7;
      const newStart = dayjs(startDate).add(delta, "day").toDate();
      const newEnd = dayjs(endDate).add(delta, "day").toDate();
      setStartDate(newStart);
      setEndDate(newEnd);
    },
    [startDate, endDate]
  );

  return (
    <div className="flex h-[75vh] flex-col">
      {/* Fixed header: stats + navigation */}
      <div className="mb-2 flex flex-none flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-emphasis text-xl font-semibold">
              {dayjs(startDate).format("MMM DD")}–{dayjs(endDate).format("MMM DD")}
              <span className="text-subtle">, {dayjs(startDate).format("YYYY")}</span>
            </h2>
            <ButtonGroup combined>
              <Button
                StartIcon="chevron-left"
                variant="icon"
                color="secondary"
                aria-label="Previous Week"
                onClick={() => navigateWeek("prev")}
              />
              <Button
                StartIcon="chevron-right"
                variant="icon"
                color="secondary"
                aria-label="Next Week"
                onClick={() => navigateWeek("next")}
              />
            </ButtonGroup>
          </div>
          <div className="flex items-center gap-4">
            <p className="text-subtle text-sm">
              <span className="text-emphasis font-semibold">{calendarEvents.length}</span> {t("bookings")}
            </p>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full bg-green-500" />
              <span className="text-subtle text-xs">Accepted</span>
              <span className="inline-block h-3 w-3 rounded-full bg-amber-500" />
              <span className="text-subtle text-xs">{t("pending")}</span>
              <span className="inline-block h-3 w-3 rounded-full bg-red-500" />
              <span className="text-subtle text-xs">{t("cancelled")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable calendar grid only */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <Calendar
          view={view}
          startDate={startDate}
          endDate={endDate}
          events={calendarEvents}
          startHour={0}
          endHour={23}
          gridCellsPerHour={4}
          onEventClick={handleEventClick}
          onDateChange={handleDateChange}
          isPending={isLoading}
          sortEvents
          hoverEventDuration={0}
          hideHeader
        />
      </div>

      {/* Booking detail sheet */}
      {selectedBooking && (
        <Sheet
          open={!!selectedBooking}
          onOpenChange={(open) => {
            if (!open) setSelectedBooking(null);
          }}>
          <SheetContent>
            <SheetHeader title={selectedBooking.title} />
            <SheetBody>
              <div className="space-y-4">
                {/* Status */}
                <div>
                  <label className="text-subtle text-xs font-medium uppercase">{t("status")}</label>
                  <div className="mt-1">
                    <Badge variant={statusBadgeVariant[selectedBooking.status] || "default"}>
                      {selectedBooking.status}
                    </Badge>
                  </div>
                </div>

                {/* Time */}
                <div>
                  <label className="text-subtle text-xs font-medium uppercase">{t("date")}</label>
                  <p className="text-emphasis mt-1 text-sm">
                    {dayjs(selectedBooking.startTime).format("ddd, MMM D, YYYY")}
                  </p>
                  <p className="text-emphasis text-sm">
                    {dayjs(selectedBooking.startTime).format("h:mm A")} –{" "}
                    {dayjs(selectedBooking.endTime).format("h:mm A")}
                  </p>
                </div>

                {/* Host */}
                {selectedBooking.user && (
                  <div>
                    <label className="text-subtle text-xs font-medium uppercase">Host</label>
                    <p className="text-emphasis mt-1 text-sm">
                      {selectedBooking.user.name || selectedBooking.user.email}
                    </p>
                    <p className="text-subtle text-xs">{selectedBooking.user.email}</p>
                  </div>
                )}

                {/* Event Type */}
                {selectedBooking.eventType && (
                  <div>
                    <label className="text-subtle text-xs font-medium uppercase">{t("event_type")}</label>
                    <p className="text-emphasis mt-1 text-sm">{selectedBooking.eventType.title}</p>
                    {selectedBooking.eventType.team && (
                      <p className="text-subtle text-xs">
                        {t("team")}: {selectedBooking.eventType.team.name}
                      </p>
                    )}
                  </div>
                )}

                {/* Location */}
                {selectedBooking.location && (
                  <div>
                    <label className="text-subtle text-xs font-medium uppercase">{t("location")}</label>
                    <p className="text-emphasis mt-1 text-sm">{selectedBooking.location}</p>
                  </div>
                )}

                {/* Attendees */}
                {selectedBooking.attendees && selectedBooking.attendees.length > 0 && (
                  <div>
                    <label className="text-subtle text-xs font-medium uppercase">{t("attendees")}</label>
                    <ul className="mt-1 space-y-1">
                      {selectedBooking.attendees.map((attendee, i) => (
                        <li key={i} className="text-sm">
                          <span className="text-emphasis">{attendee.name}</span>
                          <span className="text-subtle ml-1 text-xs">({attendee.email})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Booking UID */}
                <div>
                  <label className="text-subtle text-xs font-medium uppercase">Booking UID</label>
                  <p className="text-subtle mt-1 font-mono text-xs">{selectedBooking.uid}</p>
                </div>
              </div>
            </SheetBody>
            <SheetFooter>
              <SheetClose asChild>
                <Button color="secondary">{t("close")}</Button>
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
};

export default AdminCalendarView;
