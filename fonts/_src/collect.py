import glob, os
root = "games/guoxian-zsb"
chars = set()
for ext in ("*.html", "*.css", "*.js", "*.json", "*.md"):
    for f in glob.glob(os.path.join(root, "**", ext), recursive=True):
        if "_src" in f: continue
        try: chars |= set(open(f, encoding="utf-8").read())
        except Exception: pass
extra = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz，。、；：？！“”‘’（）《》【】—…·×√♥♡→←↑↓●○◆◇■□▲△▼▽★☆％＋－＝／＼|@#￥$&*()[]{}<>/~^_+-= "
chars |= set(extra)
chars = {c for c in chars if ord(c) >= 32}
open("games/guoxian-zsb/fonts/_src/chars.txt", "w", encoding="utf-8").write("".join(sorted(chars)))
print(len(chars))
