from types import SimpleNamespace

from app.routers import public


class FakeTable:
    def __init__(self, rows):
        self.rows = rows

    def select(self, _columns):
        return self

    def execute(self):
        return SimpleNamespace(data=self.rows, error=None, status_code=200)


class FakeSupabase:
    def __init__(self, tables):
        self.tables = tables

    def table(self, name):
        return FakeTable(self.tables[name])


def test_platform_stats_are_derived_from_live_rows(monkeypatch):
    fake = FakeSupabase({
        'users': [
            {'role': 'student', 'status': 'active', 'institution': 'UENR'},
            {'role': 'student', 'status': 'active', 'institution': 'uenr'},
            {'role': 'student', 'status': 'suspended', 'institution': 'Other'},
            {'role': 'lecturer', 'status': 'active', 'institution': 'College'},
        ],
        'courses': [{'status': 'active'}, {'status': 'archived'}, {}],
        'quiz_attempts': [
            {'score': 80, 'status': 'completed'},
            {'score': 90, 'status': 'completed'},
            {'score': 10, 'status': 'in_progress'},
        ],
    })
    monkeypatch.setattr(public, 'supabase', fake)
    monkeypatch.setattr(public, 'ensure_supabase_enabled', lambda: None)

    assert public.platform_stats() == {
        'registered_students': 2,
        'active_courses': 2,
        'average_quiz_score': 85,
        'institutions_represented': 2,
    }


def test_platform_stats_has_no_fabricated_average_without_attempts(monkeypatch):
    fake = FakeSupabase({'users': [], 'courses': [], 'quiz_attempts': []})
    monkeypatch.setattr(public, 'supabase', fake)
    monkeypatch.setattr(public, 'ensure_supabase_enabled', lambda: None)

    assert public.platform_stats()['average_quiz_score'] is None
