# Графика бота «Квартиры Братислава»

| Папка | Файл | Куда |
|---|---|---|
| `tribute/` | `avatar-640.png` | аватар подписки или канала в Tribute |
| | `cover-16x9-1920x1080.png` | обложка подписки 16:9 |
| | `cover-square-1080.png` | квадратная обложка 1:1 |
| | `post-whats-inside-1080x1350.png` | пост «что входит в подписку» для канала |
| `logo/` | `logo-1…5-*-1024.png / -640.png / .svg` | 5 вариантов логотипа; 640×640 подходит для аватарки бота |
| | `_preview-all-logos.png` | все варианты рядом: круглая аватарка, мелкий размер, тёмная тема |
| | `lockup-horizontal-on-light/dark.png` | логотип с названием, прозрачный фон |
| `16x9/` | `bratislava-night-illustration-3840x2160.png` | иллюстрация Братиславы ночью, без текста |
| | `bratislava-night-with-title-1920x1080.png` | то же, с названием |
| `bot/` | `bot-avatar-640.png` | аватар бота (`/setuserpic`) |
| | `botfather-description-picture-640x360.png` | картинка к описанию бота |

Тексты (название и описание подписки, тексты для BotFather): [ТЕКСТЫ-подписка.md](ТЕКСТЫ-подписка.md).

Во всех макетах используется логотип 1. Если выберете другой, поменяйте `logo-1-pin.svg` в HTML-файлах в `src/` и пересоберите.

## Как пересобрать

```
python3 graphics/src/build.py
```

Нужны `rsvg-convert` (brew install librsvg), Google Chrome и интернет (шрифты Unbounded и Manrope из Google Fonts).
Логотипы и силуэт города описаны в `src/build.py`, макеты с текстом лежат в `src/*.html`.
