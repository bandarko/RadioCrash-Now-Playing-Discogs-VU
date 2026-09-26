# Radio Crash hybrid VU v3.5 — time-normalized live-match

## Gdje se nalazi kod

JavaScript u WordPress administraciji:

**Custom CSS & JS → All Custom Code → `JS 1 za Svira sada + Discogs + VU`**

CSS u WordPress administraciji:

**Custom CSS & JS → All Custom Code → `CSS 1 za Svira sada + Discogs + logo lijevo + VU`**

VU nije zaseban WordPress plugin. Nalazi se na dnu istog JavaScript zapisa kao “Sada slušate”.

Detaljno objašnjenje zašto Safari treba serverski numeric-only feed, kako je isključen CORS problem i zašto sinkronizacija ne može biti potpuno jednaka lokalnom Chrome analyseru nalazi se u [`WHY-SAFARI-NEEDS-SERVER-VU.md`](WHY-SAFARI-NEEDS-SERVER-VU.md).

## Kako radi

- Chrome, Firefox i Brave: Web Audio analizira audio element postojećeg SoundManager2 playera.
- Safari: `EventSource` prima stvarne brojčane L/R razine s `https://live.radiocrash.net/vu/events`.
- Safari ne koristi Web Audio analyser jer WebKit za kontinuirani Shoutcast/Icecast stream vraća nule.
- Nema drugog `Audio` objekta, drugog audio streama ni fake/random animacije.
- SSE veza postoji samo dok glavni player svira.
- Safari čeka stvarni `playing` događaj, pa VU ne kreće prije zvuka.
- Safari koristi istu RMS skalu i gain `24` kao ostali desktop preglednici.
- Serverski feed šalje 120 mjerenja u sekundi, analizira zadnjih 256 stereo uzoraka i koristi 1,10 s vremenskog pomaka (132 mjerenja).
- Safari crta svaku pristiglu stvarnu SSE razinu izravno. Naknadno iskušano vezivanje uz `requestAnimationFrame` nije zadržano jer je na produkcijskoj stranici izgledalo tromije.
- Stop radi `unload()` postojećeg SoundManager objekta, pa svaki novi Play dobiva svjež AAC live stream bez preskakanja i digitalnih artefakata.
- Rast razine je trenutačan kao u Chromeu; samo pad LED-ica ima kratki decay normaliziran proteklim vremenom, ne brojem browser frameova.
- LED klase mijenjaju se samo kad se promijeni broj aktivnih segmenata, radi manjeg opterećenja Safarija.
- VU ima 18 segmenata po kanalu i potpuno je isključen do širine 900 px.

## Copy/paste

Zamijeni cijeli sadržaj JavaScript zapisa sadržajem datoteke:

`now-playing-discogs-vu.js`

CSS za ovo rješenje funkcionalno nije mijenjan. Dokumentirana puna kopija je:

`now-playing-discogs-vu.css`

Nakon spremanja napravi hard refresh.

## Provjera

1. Safari Play: VU prati stvarni signal.
2. Safari Stop: LED se gase i SSE veza se zatvara.
3. Safari Stop/Play: veza se ponovno otvara bez drugog audio streama.
4. Chrome, Firefox i Brave: postojeći lokalni VU i dalje radi.
5. Mobitel ili viewport do 900 px: nema VU elementa ni SSE veze.

Server-side servis i javni endpoint instalirani su 24. 9. 2026. Produkcijska konfiguracija 26. 9. 2026. potvrđena je na 120 poruka/s, 256-frame analizi i 1,10 s bufferu. Buffer je dobiven postupnim A/B podešavanjem s 1,50 preko 1,25 na 1,10 s; stopa je zatim podignuta sa 60 na 120 mjerenja/s kako bi kratki vrhovi i odziv odgovarali Chromeu/Braveu na 120 Hz zaslonu. U završnoj usporedbi Safari i Chrome izgledali su jednako. Izolirani Safari 26.6.2 test prošao je 5/5 uzastopnih Stop/Play ciklusa bez greške, duplog audio streama ili zaostalog AAC buffera.
