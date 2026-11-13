package app.opentodo.container

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** The widget reads the app's snapshot: the shared fixture (web/src/lib/testdata/widgetSnapshot.json). */
class WidgetModelTest {
    private val fixture = JSONObject(File("../../../../../web/src/lib/testdata/widgetSnapshot.json").readText())
    private val snapshot = fixture.getJSONObject("snapshot").toString()

    @Test fun readsTheFixture() {
        val m = WidgetModel.parse(snapshot)!!
        assertEquals(2, m.count)
        assertEquals(1, m.overdue)
        assertEquals(listOf("b", "a"), m.rows.map { it.id })
        assertEquals("09:30", m.rows[1].time)
        assertTrue(m.rows[0].overdue)
        assertEquals(0, m.more)
    }

    @Test fun saysItsTimeAfterAnHour() {
        val m = WidgetModel.parse(snapshot)!!
        val at = fixture.getLong("now")
        assertFalse(m.stale(at + 59 * 60_000))
        assertTrue(m.stale(at + 3 * 60 * 60_000))
    }

    @Test fun lockedShowsCountsOnly() {
        val m = WidgetModel.parse(JSONObject(snapshot).put("locked", true).toString())!!
        assertTrue(m.locked)
        assertTrue(m.rows.isEmpty())
        assertEquals(2, m.count)
    }

    @Test fun nothingPublished() {
        assertNull(WidgetModel.parse(null))
        assertNull(WidgetModel.parse("not json"))
    }
}
