#!/usr/bin/env python3
"""Make the New Ark site chat-only: nobody can call from the site.

Every tel: link becomes a "Message us" button that opens the Marcus chat (askbox.js handles [data-chat]),
every printed phone number and "call us" line is reworded to point at the chat, and the phone number is
removed from page titles, meta descriptions and structured data.

Safe to run again and again (it only changes what still mentions the phone).
Usage: python3 tools/newark_chat_only.py [site_dir]   (default: newark/)
"""
import os, re, sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "newark")
PH = r"(?:\(?908\)?[-. ]?454[-. ]?4043|\+?1?9084544043)"
CHAT_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'


def tel_link(m):
    attrs, inner = m.group(1), m.group(2)
    cls = re.search(r'class="([^"]*)"', attrs)
    cls = f' class="{cls.group(1)}"' if cls else ""
    style = re.search(r'style="([^"]*)"', attrs)
    style = f' style="{style.group(1)}"' if style else ""
    if "nav-phone" in cls:
        label = "<span>Replies in minutes, 24/7</span><b>Message us</b>"
    elif "<svg" in inner:
        label = CHAT_SVG + "Message us"
    elif re.search(r"\bbtn\b|\bcall\b", cls):
        label = "Message us"
    else:
        label = "message us"
    return f'<a{cls}{style} href="#chat" data-chat>{label}</a>'


TEXT = [
    # page titles / meta / headings
    (r"\s*\|\s*" + PH, ""),
    (r"New Ark " + PH, "New Ark"),
    (r"Call " + PH + r",? answered 24/7\.?", "Message us anytime, 24/7."),
    (r"Answered 24/7 at " + PH + r"\.?", "Message us anytime, 24/7."),
    (r"Calls to " + PH + r" are answered", "Messages are answered"),
    (r"\bCall New Ark now\b", "Message New Ark now"),
    (r"\bCall New Ark any hour\b", "Message New Ark any hour"),
    (r"New Ark answers every call", "New Ark answers every message"),
    (r"Every call is answered", "Every message is answered"),
    (r"and a licensed plumber calls you back", "and a licensed plumber gets back to you"),
    (r"Call and tell us", "Message us and tell us"),
    (r"call your gas utility or 911 first, then call us", "call your gas utility or 911 first, then message us"),
    (r"Call or request one online", "Message us or request one online"),
    (r"Have your address and a good callback number ready\.", "Have your address and a good callback number ready."),
    (r"Do you give prices over the phone\?", "Do you give prices before the visit?"),
    (r"Every call to " + PH + r" is \w*", "Every message is answered"),
    (PH + r" is answered 24/7", "Messages are answered 24/7"),
    (r"\bCall and (we|we&#x27;ll|we'll|tell)", r"Message us and \1"),
    (r"Every call answered", "Every message answered"),
    (r"\.?\s*New Ark: " + PH + r"\.?", "."),
    (r"Call New Ark</h2>", "Message New Ark</h2>"),
    (r"When the heat goes out, call and", "When the heat goes out, message us and"),
    # any remaining "call <number>"
    (r"\b[Cc]all " + PH + r"(?: right now| now)?", "message us here"),
    (r"\bat " + PH, "here on the site"),
    (r"\bor call us\b", "or message us"),
    (r"Please call us instead\.", "Please message us in the chat instead."),
    (r"\bcall us now too\b", "message us in the chat now too"),
    (r"Please call us\.", "Please message us in the chat."),
    (r"\bor call us\.", "or message us in the chat."),
]


def fix_html(s):
    s = re.sub(r'<a\s([^>]*href="tel:[^"]*"[^>]*)>(.*?)</a>', tel_link, s, flags=re.S)
    s = re.sub(r'"telephone":\s*"[^"]*",\s*', "", s)
    s = re.sub(r'\sdata-tel\b', "", s)
    s = re.sub(r'\sdata-phone-txt\b', "", s)
    for pat, rep in TEXT:
        s = re.sub(pat, rep, s)
    s = re.sub(r'\b[Cc]all <a([^>]*data-chat)>message us</a>', r'<a\1>Message us</a>', s)
    # footer lines like "... &middot; 908-454-4043 &middot; ..." and any other leftover bare number
    s = re.sub(r"\s*&middot;\s*" + PH, "", s)
    s = re.sub(r'<a href="#chat" data-chat>message us</a>(?=\s*&middot;)', '<a href="#chat" data-chat>Message us</a>', s)
    return s


def main():
    changed = 0
    for dp, _, files in os.walk(ROOT):
        for f in files:
            if not f.endswith(".html"):
                continue
            p = os.path.join(dp, f)
            old = open(p, encoding="utf-8").read()
            new = fix_html(old)
            if new != old:
                open(p, "w", encoding="utf-8").write(new)
                changed += 1
    print(f"chat-only: {changed} page(s) updated in {ROOT}")


if __name__ == "__main__":
    main()
