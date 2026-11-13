package app.opentodo.container

import org.junit.Assert.assertEquals
import org.junit.Test

class ReminderScheduleTest {
    private val now = 1_794_556_800_000L

    @Test fun keepsTheWindowEarliestFirst() {
        val json = """[{"id":"late","taskId":"t","fireAt":${now + 7_200_000}},{"id":"soon","taskId":"t","fireAt":${now + 60_000},"title":"Call"},
            {"id":"past","taskId":"t","fireAt":${now - 120_000}},{"id":"far","taskId":"t","fireAt":${now + 9L * 24 * 3_600_000}},{"id":"soon","taskId":"t","fireAt":${now + 1}}]"""
        assertEquals(listOf("soon", "late"), ReminderSchedule.parse(json, now).map { it.id })
        assertEquals("Call", ReminderSchedule.parse(json, now)[0].title)
    }

    @Test fun aSnoozeMovesOneReminderTenMinutesOn() {
        val list = ReminderSchedule.parse("""[{"id":"a","taskId":"t","fireAt":$now},{"id":"b","taskId":"t","fireAt":${now + 300_000}}]""", null)
        val moved = ReminderSchedule.moved(list, "a", now + ReminderSchedule.SNOOZE_MS)
        assertEquals(listOf("b" to now + 300_000, "a" to now + 600_000), moved.map { it.id to it.fireAt })
    }

    @Test fun onlyCompleteAndSnooze() {
        assertEquals(listOf("done", "snooze"), ReminderSchedule.ACTIONS)
        assertEquals(false, ReminderSchedule.isAction("dismiss"))
    }
}
