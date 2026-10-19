#!/usr/bin/env python3
"""Собирает всю графику бота: логотипы, обложки для Tribute, картинки 16:9.

Запуск: python3 graphics/src/build.py
Логотипы рендерятся через rsvg-convert, макеты с текстом — через Chrome headless
(шрифты Unbounded и Manrope грузятся из Google Fonts, нужен интернет).
"""
import math
import pathlib
import random
import shutil
import subprocess

SRC = pathlib.Path(__file__).resolve().parent
OUT = SRC.parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

BLUE_1, BLUE_2 = "#4F8BFF", "#1C3CD6"
WARM = "#FFB547"
NAVY = "#0B1238"


# ---------------------------------------------------------------- логотипы

def bg_blue():
    return f"""
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{BLUE_1}"/><stop offset="1" stop-color="{BLUE_2}"/>
    </linearGradient>
    <radialGradient id="shine" cx=".3" cy=".2" r=".8">
      <stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <rect width="1024" height="1024" fill="url(#shine)"/>"""


def svg(body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">{body}\n</svg>\n'


# 1. Пин с домиком: «квартира на карте»
LOGO_PIN = svg(bg_blue() + f"""
  <ellipse cx="512" cy="842" rx="120" ry="22" fill="#0B1F8A" opacity=".35"/>
  <path d="M512 828 C470 770 252 610 252 446 A260 260 0 1 1 772 446 C772 610 554 770 512 828 Z" fill="#fff"/>
  <path d="M512 296 L656 418 L616 418 L616 572 L408 572 L408 418 L368 418 Z"
        fill="#2B5CF0" stroke="#2B5CF0" stroke-width="26" stroke-linejoin="round"/>
  <rect x="482" y="478" width="60" height="94" rx="10" fill="{WARM}"/>
""")

# 2. Братиславский град с бейджем «новое»
def castle_logo():
    win = "".join(
        f'<rect x="{372 + c * 46}" y="{488 + r * 56}" width="22" height="30" rx="5" fill="#2B5CF0"/>'
        for r in range(2) for c in range(7)
    )
    return svg(bg_blue() + f"""
  <path d="M150 716 C260 640 380 640 512 640 C644 640 764 640 874 716 Z" fill="#fff" opacity=".22"/>
  <g fill="#fff">
    <rect x="356" y="452" width="312" height="200"/>
    <path d="M340 452 L372 412 L652 412 L684 452 Z"/>
    <rect x="292" y="404" width="84" height="248" rx="4"/>
    <rect x="648" y="404" width="84" height="248" rx="4"/>
    <path d="M286 408 L334 336 L382 408 Z"/>
    <path d="M642 408 L690 336 L738 408 Z"/>
  </g>
  {win}
  <rect x="318" y="440" width="32" height="44" rx="6" fill="#2B5CF0"/>
  <rect x="674" y="440" width="32" height="44" rx="6" fill="#2B5CF0"/>
  <path d="M220 760 Q290 735 360 760 T500 760 T640 760 T780 760" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round" opacity=".55"/>
  <circle cx="742" cy="296" r="86" fill="{WARM}" stroke="#3567F4" stroke-width="22"/>
  <path d="M742 252 v52 M742 336 v2" stroke="#fff" stroke-width="22" stroke-linecap="round"/>
""")

LOGO_CASTLE = castle_logo()

# 3. Сообщение с ключом: «ключи от квартиры прямо в Telegram»
LOGO_KEY = svg(bg_blue() + f"""
  <path d="M392 262 H632 A160 160 0 0 1 792 422 V542 A160 160 0 0 1 632 702 H430 L296 792 L318 682 A160 160 0 0 1 232 542 V422 A160 160 0 0 1 392 262 Z" fill="#fff"/>
  <path d="M322 478 L402 410 L482 478 L482 574 L322 574 Z" fill="none" stroke="#2B5CF0" stroke-width="40" stroke-linejoin="round"/>
  <rect x="380" y="500" width="44" height="40" rx="8" fill="{WARM}"/>
  <rect x="490" y="504" width="240" height="40" rx="20" fill="#2B5CF0"/>
  <rect x="640" y="530" width="36" height="66" rx="10" fill="#2B5CF0"/>
  <rect x="694" y="530" width="32" height="50" rx="10" fill="#2B5CF0"/>
""")

# 4. Радар: бот сканирует сайты (тёмный вариант)
def radar_logo():
    cx, cy = 512, 540
    rings = "".join(
        f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="#5B8CFF" stroke-opacity="{o}" stroke-width="6"/>'
        for r, o in ((150, .55), (250, .38), (350, .22))
    )
    a1, a2 = math.radians(-100), math.radians(-35)
    R = 360
    p1 = (cx + R * math.cos(a1), cy + R * math.sin(a1))
    p2 = (cx + R * math.cos(a2), cy + R * math.sin(a2))

    def dot(r, deg, size, color):
        a = math.radians(deg)
        x, y = cx + r * math.cos(a), cy + r * math.sin(a)
        return (f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{size * 2.2}" fill="{color}" opacity=".25"/>'
                f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{size}" fill="{color}"/>')

    return svg(f"""
  <defs>
    <radialGradient id="g" cx=".5" cy=".53" r=".6">
      <stop offset="0" stop-color="#1F3FB8"/><stop offset="1" stop-color="{NAVY}"/>
    </radialGradient>
    <linearGradient id="sweep" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#5B8CFF" stop-opacity="0"/><stop offset="1" stop-color="#5B8CFF" stop-opacity=".55"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#g)"/>
  {rings}
  <path d="M{cx} {cy} L{p1[0]:.1f} {p1[1]:.1f} A{R} {R} 0 0 1 {p2[0]:.1f} {p2[1]:.1f} Z" fill="url(#sweep)"/>
  <line x1="{cx}" y1="{cy}" x2="{p2[0]:.1f}" y2="{p2[1]:.1f}" stroke="#9DBBFF" stroke-width="6" stroke-linecap="round"/>
  {dot(250, -52, 20, WARM)}
  {dot(350, -128, 16, "#2EE59D")}
  {dot(150, 25, 13, "#9DBBFF")}
  {dot(350, 160, 12, "#9DBBFF")}
  <path d="M512 420 L616 508 L588 508 L588 632 L436 632 L436 508 L408 508 Z" fill="#fff" stroke="#fff" stroke-width="20" stroke-linejoin="round"/>
  <rect x="488" y="552" width="48" height="80" rx="8" fill="{WARM}"/>
""")

LOGO_RADAR = radar_logo()

# 5. Тёплый вариант: домик с колокольчиком уведомления
LOGO_WARM = svg(f"""
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFB547"/><stop offset="1" stop-color="#FF5A5F"/>
    </linearGradient>
    <radialGradient id="shine" cx=".3" cy=".2" r=".8">
      <stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <rect width="1024" height="1024" fill="url(#shine)"/>
  <path d="M512 270 L770 486 L712 486 L712 742 L312 742 L312 486 L254 486 Z" fill="#fff" stroke="#fff" stroke-width="36" stroke-linejoin="round"/>
  <path d="M440 650 C440 650 452 630 452 580 C452 540 478 512 512 512 C546 512 572 540 572 580 C572 630 584 650 584 650 Z" fill="#FF6A55"/>
  <circle cx="512" cy="672" r="22" fill="#FF6A55"/>
  <rect x="502" y="490" width="20" height="30" rx="10" fill="#FF6A55"/>
  <circle cx="700" cy="350" r="70" fill="{BLUE_2}" stroke="#fff" stroke-width="22"/>
""")

LOGOS = {
    "logo-1-pin": LOGO_PIN,
    "logo-2-castle": LOGO_CASTLE,
    "logo-3-key-chat": LOGO_KEY,
    "logo-4-radar-dark": LOGO_RADAR,
    "logo-5-warm-bell": LOGO_WARM,
}


# ---------------------------------------------------------------- силуэт Братиславы

def skyline(seed=7):
    rnd = random.Random(seed)
    W, H, HZ = 1920, 1080, 716
    parts = []
    add = parts.append

    add(f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" preserveAspectRatio="xMidYMid slice">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="{HZ}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#070C2E"/><stop offset=".38" stop-color="#16287A"/>
    <stop offset=".64" stop-color="#4E47A6"/><stop offset=".82" stop-color="#D9787F"/>
    <stop offset=".93" stop-color="#FFAE6B"/><stop offset="1" stop-color="#FFD39A"/>
  </linearGradient>
  <linearGradient id="river" x1="0" y1="{HZ}" x2="0" y2="{H}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#7A5A92"/><stop offset=".18" stop-color="#2E3375"/><stop offset="1" stop-color="#060A26"/>
  </linearGradient>
  <radialGradient id="sun" cx="1430" cy="{HZ}" r="620" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#FFE0A6" stop-opacity=".95"/><stop offset=".35" stop-color="#FF9F6B" stop-opacity=".35"/>
    <stop offset="1" stop-color="#FF9F6B" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="castleGlow" cx="580" cy="470" r="230" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#FFD9A0" stop-opacity=".32"/><stop offset="1" stop-color="#FFD9A0" stop-opacity="0"/>
  </radialGradient>
  <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
  <filter id="blurS" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2"/></filter>
</defs>
<rect width="{W}" height="{HZ}" fill="url(#sky)"/>
<rect width="{W}" height="{HZ}" fill="url(#sun)"/>""")

    # звёзды
    for _ in range(170):
        x, y = rnd.uniform(0, W), rnd.uniform(0, 400) ** 1.0
        if rnd.random() < .5:
            y = rnd.uniform(0, 230)
        add(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{rnd.uniform(.6, 2.1):.1f}" fill="#fff" opacity="{rnd.uniform(.25, .9):.2f}"/>')
    # тонкий месяц
    add('<path d="M268 150 A54 54 0 1 0 330 232 A44 44 0 1 1 268 150 Z" fill="#FFF3D6" opacity=".92"/>')

    add('<circle cx="580" cy="470" r="230" fill="url(#castleGlow)"/>')

    # дальние холмы (Малые Карпаты) и панельки Петржалки
    add(f'<path d="M0 600 C180 552 360 586 520 566 C700 540 860 596 1040 618 L1040 {HZ} L0 {HZ} Z" fill="#36337A" opacity=".75"/>')
    x = 1580
    while x < W:
        w, h = rnd.randint(40, 90), rnd.randint(50, 120)
        add(f'<rect x="{x}" y="{HZ - h}" width="{w}" height="{h}" fill="#3B3176" opacity=".85"/>')
        for wy in range(HZ - h + 10, HZ - 8, 14):
            for wx in range(x + 6, x + w - 6, 12):
                if rnd.random() < .12:
                    add(f'<rect x="{wx}" y="{wy}" width="5" height="6" fill="#FFCB7A" opacity=".8"/>')
        x += w + rnd.randint(8, 40)

    # замковый холм
    add(f'<path d="M80 {HZ} C190 650 300 572 420 550 C500 538 680 538 750 548 C840 562 910 616 980 668 L1030 {HZ} Z" fill="#1A1B4A"/>')

    # Братиславский град: задние башни, корпус, передние башни
    for x0 in (478, 644):
        add(f'<rect x="{x0}" y="424" width="38" height="120" fill="#D9CDBB"/>'
            f'<path d="M{x0 - 3} 426 L{x0 + 19} 394 L{x0 + 41} 426 Z" fill="#8E3A31"/>')
    add('<rect x="452" y="446" width="276" height="100" fill="#F1E9DC"/>')
    add('<path d="M444 448 L472 418 L708 418 L736 448 Z" fill="#A8473A"/>')
    for x0 in (424, 704):
        add(f'<rect x="{x0}" y="412" width="54" height="134" fill="#F6EFE4"/>'
            f'<path d="M{x0 - 4} 414 L{x0 + 27} 372 L{x0 + 58} 414 Z" fill="#9C3F33"/>')
    for r in range(3):
        for c in range(10):
            lit = rnd.random() < .35
            add(f'<rect x="{472 + c * 24}" y="{462 + r * 26}" width="9" height="13" fill="{"#FFC66E" if lit else "#BFAE95"}"/>')
    for x0 in (436, 716):
        for r in range(3):
            add(f'<rect x="{x0 + 14}" y="{430 + r * 34}" width="9" height="14" fill="#BFAE95"/>')

    # собор Святого Мартина
    add('<path d="M770 640 L770 600 L835 570 L900 600 L900 640 Z" fill="#202256"/>')
    add('<rect x="828" y="478" width="34" height="140" fill="#202256"/>')
    add('<path d="M826 480 L845 398 L864 480 Z" fill="#202256"/>')
    add('<circle cx="845" cy="394" r="6" fill="#FFD36B"/>')

    # Старый город
    x = 640
    while x < 1360:
        w, h = rnd.randint(34, 74), rnd.randint(50, 118)
        top = HZ - h
        roof = rnd.random() < .55
        color = rnd.choice(["#1E2051", "#23265B", "#1A1C49"])
        if roof:
            add(f'<path d="M{x} {HZ} L{x} {top} L{x + w / 2:.0f} {top - rnd.randint(14, 30)} L{x + w} {top} L{x + w} {HZ} Z" fill="{color}"/>')
        else:
            add(f'<rect x="{x}" y="{top}" width="{w}" height="{h}" fill="{color}"/>')
        for wy in range(top + 12, HZ - 14, 18):
            for wx in range(x + 7, x + w - 9, 14):
                if rnd.random() < .3:
                    add(f'<rect x="{wx}" y="{wy}" width="6" height="8" fill="#FFC66E" opacity="{rnd.uniform(.7, 1):.2f}"/>')
        x += w + rnd.randint(-6, 4)
    # дома под холмом слева
    x = 0
    while x < 640:
        w, h = rnd.randint(30, 60), rnd.randint(26, 64)
        add(f'<rect x="{x}" y="{HZ - h}" width="{w}" height="{h}" fill="#15163F"/>')
        for wy in range(HZ - h + 8, HZ - 10, 16):
            for wx in range(x + 6, x + w - 8, 13):
                if rnd.random() < .22:
                    add(f'<rect x="{wx}" y="{wy}" width="5" height="7" fill="#FFC66E"/>')
        x += w + rnd.randint(0, 6)

    # Мост SNP с «тарелкой»
    deck = HZ - 4
    ux, uy = 1742, 474
    for cxp in range(1100, 1680, 34):
        add(f'<line x1="{ux - 8}" y1="{uy + 26}" x2="{cxp}" y2="{deck}" stroke="#1B1E48" stroke-width="1.6" opacity=".7"/>')
    for cxp in range(1800, 1920, 30):
        add(f'<line x1="{ux + 8}" y1="{uy + 26}" x2="{cxp}" y2="{deck}" stroke="#1B1E48" stroke-width="1.6" opacity=".7"/>')
    add(f'<path d="M1690 {deck} L1706 {deck} L{ux - 2} {uy + 14} L{ux - 12} {uy + 14} Z" fill="#14163C"/>')
    add(f'<path d="M1780 {deck} L1796 {deck} L{ux + 12} {uy + 14} L{ux + 2} {uy + 14} Z" fill="#14163C"/>')
    add(f'<rect x="1000" y="{deck - 6}" width="{W - 1000}" height="12" fill="#14163C"/>')
    add(f'<ellipse cx="{ux}" cy="{uy - 8}" rx="46" ry="13" fill="#1B1E48"/>')
    add(f'<ellipse cx="{ux}" cy="{uy + 4}" rx="66" ry="15" fill="#14163C"/>')
    add(f'<ellipse cx="{ux}" cy="{uy}" rx="60" ry="5" fill="#FFD08A" opacity=".95"/>')
    add(f'<circle cx="{ux}" cy="{uy - 24}" r="4" fill="#FF4D4D"/>')
    for lx in range(1010, W, 32):
        add(f'<circle cx="{lx}" cy="{deck - 10}" r="2.6" fill="#FFD08A"/>')

    # набережная с фонарями
    add(f'<rect x="0" y="{HZ}" width="1000" height="8" fill="#101233"/>')
    for lx in range(14, 1000, 38):
        add(f'<circle cx="{lx}" cy="{HZ - 2}" r="2.4" fill="#FFD08A" opacity=".9"/>')

    # река и отражения
    add(f'<rect x="0" y="{HZ + 6}" width="{W}" height="{H - HZ - 6}" fill="url(#river)"/>')
    add(f'<ellipse cx="1430" cy="{HZ + 30}" rx="420" ry="40" fill="#FFB27A" opacity=".25" filter="url(#blur)"/>')
    add(f'<ellipse cx="590" cy="{HZ + 70}" rx="150" ry="60" fill="#FFE2B8" opacity=".10" filter="url(#blur)"/>')
    # дорожки огней: короткие штрихи, которые редеют к зрителю
    for _ in range(260):
        x = rnd.uniform(0, W)
        d = rnd.random() ** 1.8
        y = HZ + 12 + d * 300
        add(f'<rect x="{x:.0f}" y="{y:.0f}" width="{rnd.uniform(10, 46):.0f}" height="{1.5 + d * 2:.1f}" rx="1" '
            f'fill="#FFC27A" opacity="{(1 - d) * rnd.uniform(.15, .55):.2f}"/>')
    for _ in range(140):
        x, y = rnd.uniform(0, W), rnd.uniform(HZ + 20, H)
        add(f'<rect x="{x:.0f}" y="{y:.0f}" width="{rnd.uniform(30, 140):.0f}" height="1.6" rx="1" fill="#BFD0FF" opacity="{rnd.uniform(.04, .16):.2f}"/>')

    add("</svg>\n")
    return "\n".join(parts)


# ---------------------------------------------------------------- рендер

def rsvg(svg_path, png_path, size):
    subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size), "-o", str(png_path), str(svg_path)], check=True)


def chrome(html_path, png_path, w, h, scale=1, transparent=False):
    args = [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
            "--virtual-time-budget=10000", f"--window-size={w},{h}",
            f"--force-device-scale-factor={scale}", f"--screenshot={png_path}"]
    if transparent:
        args.append("--default-background-color=00000000")
    args.append(html_path.as_uri())
    subprocess.run(args, check=True, capture_output=True)


def main():
    (OUT / "logo").mkdir(exist_ok=True)
    (OUT / "tribute").mkdir(exist_ok=True)
    (OUT / "16x9").mkdir(exist_ok=True)
    (OUT / "bot").mkdir(exist_ok=True)

    for name, code in LOGOS.items():
        p = SRC / f"{name}.svg"
        p.write_text(code)
        rsvg(p, OUT / "logo" / f"{name}-1024.png", 1024)
        rsvg(p, OUT / "logo" / f"{name}-640.png", 640)
        shutil.copy(p, OUT / "logo" / f"{name}.svg")

    (SRC / "skyline.svg").write_text(skyline())

    jobs = [
        ("logo-preview.html", OUT / "logo" / "_preview-all-logos.png", 1600, 900, 1, False),
        ("lockup-light.html", OUT / "logo" / "lockup-horizontal-on-light.png", 1600, 420, 1, True),
        ("lockup-dark.html", OUT / "logo" / "lockup-horizontal-on-dark.png", 1600, 420, 1, True),
        ("hero-clean.html", OUT / "16x9" / "bratislava-night-illustration-3840x2160.png", 1920, 1080, 2, False),
        ("hero-title.html", OUT / "16x9" / "bratislava-night-with-title-1920x1080.png", 1920, 1080, 1, False),
        ("tribute-cover.html", OUT / "tribute" / "cover-16x9-1920x1080.png", 1920, 1080, 1, False),
        ("tribute-square.html", OUT / "tribute" / "cover-square-1080.png", 1080, 1080, 1, False),
        ("tribute-benefits.html", OUT / "tribute" / "post-whats-inside-1080x1350.png", 1080, 1350, 1, False),
        ("bot-description.html", OUT / "bot" / "botfather-description-picture-640x360.png", 640, 360, 2, False),
    ]
    for html, png, w, h, scale, transparent in jobs:
        chrome(SRC / html, png, w, h, scale, transparent)
        print("✓", png.relative_to(OUT))

    # у горизонтального логотипа обрезаем пустые поля
    from PIL import Image
    for v in ("light", "dark"):
        p = OUT / "logo" / f"lockup-horizontal-on-{v}.png"
        im = Image.open(p)
        l, t, r, b = im.getbbox()
        im.crop((max(l - 40, 0), max(t - 40, 0), min(r + 40, im.width), min(b + 40, im.height))).save(p)

    # BotFather принимает картинку описания ровно 640×360: рендерим в 2x и уменьшаем
    p = OUT / "bot" / "botfather-description-picture-640x360.png"
    Image.open(p).convert("RGB").resize((640, 360), Image.LANCZOS).save(p)

    shutil.copy(OUT / "logo" / "logo-1-pin-640.png", OUT / "tribute" / "avatar-640.png")
    shutil.copy(OUT / "logo" / "logo-1-pin-640.png", OUT / "bot" / "bot-avatar-640.png")


if __name__ == "__main__":
    main()
