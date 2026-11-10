import unittest

from src.data_cleaning import clean_text, parse_list


class DataCleaningTests(unittest.TestCase):
    def test_parse_list_handles_csv_serialized_lists(self):
        self.assertEqual(parse_list("['chicken', 'rice']"), ["chicken", "rice"])
        self.assertEqual(parse_list("not a list"), [])

    def test_clean_text_handles_missing_and_whitespace(self):
        self.assertEqual(clean_text(None), "")
        self.assertEqual(clean_text("  one\n two  "), "one two")


if __name__ == "__main__":
    unittest.main()
