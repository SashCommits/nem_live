"""Guard the externally hosted data widgets' shared loading lifecycle."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class WidgetLoadingTests(unittest.TestCase):
    def test_electrification_retries_and_dismisses_only_after_real_data(self):
        js = (ROOT / "electrification-widget.js").read_text()
        self.assertIn("window.psBatteryLoader", js)
        self.assertIn('loader.loading(root, "Loading electrification data', js)
        self.assertIn('if (loader) loader.done(root)', js)
        self.assertIn("loader.error(root", js)
        self.assertIn("function () { initWidget(root); }", js)
        self.assertIn("root._psElecThemeObserver.disconnect()", js)
        self.assertIn("if (!any)", js)

    def test_headroom_preserves_subscriber_gates_and_retries_network(self):
        js = (ROOT / "headroom-widget.js").read_text()
        self.assertIn("window.psBatteryLoader", js)
        self.assertIn('loader.loading(root, "Loading grid headroom', js)
        self.assertIn("loader.done(root)", js)
        self.assertIn("loader.error(root", js)
        for gate in ("signed_out", "not_subscribed", "wrong_tier"):
            self.assertIn(gate, js)
        self.assertIn("function () { start(root); }", js)
        self.assertIn('loader.loading(detail, "Loading connection point', js)
        self.assertIn("loader.done(detail)", js)


if __name__ == "__main__":
    unittest.main()
