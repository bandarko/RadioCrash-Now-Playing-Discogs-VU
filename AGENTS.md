# Upute za rad u repozitoriju

## RadioCrash Now Playing Discogs VU

- Glavni izvori su `now-playing-discogs-vu.js`, pripadni CSS i `discogs-proxy.php`. Održavaj jedan audio stream i sačuvaj razliku između mjerenja u podržanim preglednicima i vizualne animacije u Safariju.
- `server-vu/` čuva arhiv umirovljenog rješenja. Trenutačna Safari animacija ne koristi `/vu/` niti otvara drugi audio izvor.
- Pokreni `node --check now-playing-discogs-vu.js` i `php -l discogs-proxy.php`. Za izmjene playera pokreni `python3 tests/harness_server.py` i Safari test iz `README.md`; provjeri i jedan Chromium preglednik.

## Rad na izmjenama

- Pročitaj `README.md` i sve upute za direktorij koji mijenjaš. Sačuvaj postojeće korisničke izmjene i ograniči zahvat na traženi opseg.
- Prije commita pregledaj diff. U završnom izvještaju navedi koje su provjere stvarno pokrenute i što još treba provjeriti u stvarnom okruženju.
- Objava izvornog koda na GitHubu i primjena u produkciji zasebni su koraci. Primjenu provedi kad je izričito zatražena.
