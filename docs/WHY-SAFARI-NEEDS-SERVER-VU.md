# Zašto Safari treba serverski VU

Status dokumenta: 25. 9. 2026.

Aktivna implementacija: `hybrid real VU v3.3 Safari live-match`

## Kratki odgovor

Chrome, Firefox i Brave dopuštaju da Web Audio API analizira dekodirani signal iz istog `HTMLAudioElement` elementa koji korisnik sluša. Zato njihov VU mjeri upravo one audio uzorke koji u tom trenutku odlaze prema zvučnicima.

Safari uredno reproducira Radio Crash live stream, ali u testiranom WebKit putu ne predaje uzorke kontinuiranog Shoutcast/Icecast streama u `MediaElementAudioSourceNode`. `AnalyserNode` zato dobiva niz nula i lokalni VU ostaje ugašen, iako se glazba čuje.

Radio Crash u Safariju zato koristi jedan FFmpeg analizator na streaming serveru. On iz istog izvornog programa izračunava stvarne lijeve i desne razine, a Safari prima samo male brojčane poruke preko Server-Sent Eventsa (SSE). U Safariju se ne otvara drugi audio stream i ne generira se nasumična ili unaprijed zadana animacija.

## Uobičajeni put u Chromeu, Firefoxu i Braveu

```text
postojeći SoundManager2 player
        │
        └─ HTMLAudioElement koji korisnik sluša
               │
               └─ MediaElementAudioSourceNode
                      │
                      └─ ChannelSplitterNode
                           ├─ lijevi AnalyserNode
                           └─ desni AnalyserNode
                                  │
                                  └─ RMS → gain 24 → 18 LED segmenata
```

`createMediaElementSource()` veže Web Audio graf na postojeći player. Kod ne stvara novi `Audio` objekt, ne mijenja URL streama i ne pokreće dodatnu reprodukciju.

Lokalna grana koristi:

- `fftSize = 256`;
- odvojene lijevi i desni kanal;
- RMS vremenskog signala;
- gain `24`;
- trenutačan attack i decay `0.3` samo pri padu;
- `requestAnimationFrame` za crtanje.

Najvažnija prednost tog puta jest sinkronizacija: analyser čita dekodirane uzorke iz istog playera i istog lokalnog media clocka koji proizvode zvuk. Mrežni i player buffer već su uključeni u signal koji analyser vidi.

## Što se događa u Safariju

U Safariju je potvrđeno sljedeće:

- `HTMLAudioElement` reproducira stream i njegovo vrijeme napreduje;
- `AudioContext` je u stanju `running`;
- Web Audio graf se može stvoriti;
- `getByteTimeDomainData()` i `getFloatTimeDomainData()` ipak vraćaju samo nule za kontinuirani stream;
- ista VU matematika ispravno radi s konačnom WAV datotekom.

Praktični rezultat jest da Safari ima reprodukciju, ali JavaScript nema stvarne PCM uzorke potrebne za izračun VU-a.

To je u skladu s dugotrajnim [WebKit bugom 180696](https://bugs.webkit.org/show_bug.cgi?id=180696). Prijava opisuje HLS i Icecast tokove koji sviraju u Safariju, ali nisu pravilno dostupni Web Audio grafu; na istoj prijavi postoje i noviji izvještaji o analyseru koji vraća nule. Status prijave bio je `NEW` pri posljednjoj provjeri ovog dokumenta.

Prema [Web Audio specifikaciji za `MediaElementAudioSourceNode`](https://webaudio.github.io/web-audio-api/#MediaElementAudioSourceNode), audio iz media elementa treba biti preusmjeren kroz Web Audio graf. Specifikacija također zahtijeva tišinu kada je izvor označen kao CORS-cross-origin, radi zaštite sadržaja. Radio Crash slučaj nije zaključen kao obična CORS blokada jer su testirani ispravni CORS headeri i same-origin proxy, a rezultat kontinuiranog streama i dalje je bio niz nula.

## Kako je isključen problem u našem kodu

| Test u Safariju | Reprodukcija | Rezultat analysera |
| --- | --- | --- |
| Radio Crash stream izravno | radi | samo nule |
| Isti stream preko same-origin proxyja kao `audio/aacp` | radi | samo nule |
| Isti stream preko same-origin proxyja kao `audio/mpeg` | radi | samo nule |
| Lokalno generirani kontinuirani MP3 stream | radi | samo nule |
| Konačna stereo WAV datoteka | radi | stvarne vrijednosti |

Dodatno je provjereno:

- `crossOrigin="anonymous"` postavljen je prije `src`;
- streaming odgovor ima odgovarajući `Access-Control-Allow-Origin`;
- testirani su byte i float podaci analysera;
- analyser je bio spojen u obaveznu audio signalnu putanju;
- L/R RMS račun, gain i LED prikaz rade s konačnom datotekom;
- promjena MIME zaglavlja nije popravila live analyser.

Zbog toga uzrok nije CSS, LED renderer, RMS formula, pogrešan kanal, samo vrijeme pokretanja ni uobičajena CORS konfiguracija. Ograničenje se pojavljuje kada WebKit reproducira kontinuirani stream kroz svoj media put, ali ga ne izlaže lokalnom Web Audio analyseru.

## Odabrana Safari arhitektura

```text
                           ┌─ Chrome / Firefox / Brave
Shoutcast live.mp3 ──────┤  postojeći browser player → lokalni Web Audio VU
                           │
                           └─ streaming server
                                └─ jedan FFmpeg decoder
                                     └─ PCM L/R RMS + peak
                                          └─ 1,10 s red razina
                                               └─ SSE brojke
                                                    └─ Safari LED VU

Safari zvuk: postojeći browser player → zvučnici
Safari VU:   SSE brojke → LED prikaz
```

Servis `rc-vu.service` otvara jednu lokalnu vezu prema `http://127.0.0.1:8000/live.mp3`. FFmpeg dekodira stereo signal u 44,1 kHz `pcm_s16le`, a Python servis računa:

- `rmsDbL` i `rmsDbR`;
- `peakDbL` i `peakDbR`;
- 60 mjerenja u sekundi;
- zadnjih 256 stereo frameova po mjerenju;
- red razina od 1,10 sekundi (66 mjerenja) za približno poravnanje s reprodukcijskim bufferom.

Nginx javno izlaže samo:

- `https://live.radiocrash.net/vu/events` — SSE razine;
- `https://live.radiocrash.net/vu/status` — status servisa.

Servis ne snima audio, ne sprema ga na disk i ne prosljeđuje audio posjetiteljima. SSE sadrži samo JSON brojeve.

## Zašto ovo nije drugi stream u Safariju

Audio veza i VU veza imaju različite uloge:

- postojeći SoundManager2 `HTMLAudioElement` jedini preuzima i reproducira zvuk u pregledniku;
- `EventSource` preuzima samo tekstualne L/R vrijednosti;
- u Safari grani nema `new Audio()`, dodatnog audio `src`, ni dodatnog `play()` poziva;
- jedan serverski FFmpeg proces dijele svi Safari posjetitelji, umjesto da svaki posjetitelj pokreće još jedan audio download.

To izbjegava dupli zvuk, udvostručen promet prema streamu i dvije reprodukcije koje bi se međusobno razilazile.

## Zašto Safari VU može malo odstupati od Chromea

Chromeov analyser i zvuk koriste isti lokalni media clock. Safari VU i Safari zvuk koriste dva vremenska puta:

1. browser samostalno buffera i reproducira audio;
2. server analizira isti program blizu izvora, zatim odgađa brojčane razine za fiksnih 1,10 sekundi i šalje ih mrežom.

Safari, mreža i SoundManager mogu dinamički mijenjati količinu audio buffera. SSE nema pristup točnom trenutku uzorka koji Safari upravo šalje prema zvučnicima, pa fiksnih 1,10 sekundi predstavlja praktično, produkcijski izmjereno poravnanje, a ne sample-accurate sinkronizaciju. Vrijednost je 26. 9. 2026. podešena s 1,50 preko 1,25 na 1,10 s prema stvarnoj Safari reprodukciji.

Zbog toga se mogu primijetiti male razlike:

- Safari VU može malo kasniti ili uraniti u odnosu na zvuk;
- lokalni Chrome VU može izgledati mrvicu življe;
- kratke mrežne promjene mogu privremeno promijeniti poravnanje;
- vrijednosti mogu biti vrlo slične, ali ne moraju u svakom frameu biti identične.

To nije fake VU: vrijednosti su stvarno izračunate iz istog stereo programa. Razlika je u mjestu mjerenja i vremenskom putu.

## Pokretanje i zaustavljanje u Safariju

SSE veza ne otvara se na prvi `play` zahtjev, nego tek nakon stvarnog `playing` događaja glavnog playera. Tako VU ne kreće prije zvuka dok Safari još puni početni buffer.

Na Stop se:

1. zatvara `EventSource`;
2. LED vraća na 0/0;
3. postojećem SoundManager soundu poziva `unload()`.

`unload()` je potreban jer je tema prije toga samo pauzirala beskonačni AAC stream. Ponovno korištenje takvog starog Safari buffera nakon više Stop/Play ciklusa uzrokovalo je preskakanje, digitalne artefakte ili nestanak zvuka. Sljedeći Play otvara svježu vezu na istom player objektu; ne stvara drugi player.

## Zašto nisu odabrane druge varijante

### Fake animacija

Ne prati glazbu, ne prikazuje stvarni stereo signal i korisniku daje pogrešan dojam. Korištena je samo kao privremeni fallback tijekom ranog razvoja i nije dio sadašnjeg rješenja.

### Drugi audio element samo za analyser

Mogao bi otvoriti još jedan stream, proizvesti dupli zvuk ili dodatno opteretiti streaming server. Dva nezavisna playera ne bi ostala pouzdano sinkronizirana. Ova je varijanta namjerno zabranjena pravilom “existing player only”.

### Browser proxy ili promjena MIME tipa

Same-origin proxy, `audio/aacp` i `audio/mpeg` već su testirani. Reprodukcija je radila, ali Safari analyser i dalje je vraćao nule.

### Crtanje preko `requestAnimationFrame` u Safariju

Eksperimentalna v3.4 spremala je zadnju SSE razinu i crtala je u `requestAnimationFrame`. Regresijski test bio je stabilan, ali je pokret na stvarnoj stranici izgledao tromije. Produkcija je zato vraćena na v3.3, koja crta svaku pristiglu SSE razinu izravno.

## Kada ponovno probati lokalni Safari analyser

Serverski put treba zadržati dok novi Safari/WebKit ne prođe sve ove provjere na stvarnom Radio Crash streamu:

1. `getByteTimeDomainData()` ili `getFloatTimeDomainData()` vraća vrijednosti koje nisu nule;
2. lijevi i desni kanal ostaju odvojeni;
3. zvuk i analyser koriste isključivo postojeći player;
4. nema drugog audio zahtjeva;
5. najmanje pet Stop/Play ciklusa prolazi bez preskakanja, artefakata ili tišine;
6. ponašanje je potvrđeno na produkcijskoj stranici, ne samo s konačnom audio datotekom.

Ako to bude radilo, Safari se može vratiti na isti lokalni put kao Chrome i ukloniti procijenjeno vremensko poravnanje. Do tada je serverski numeric-only feed najpouzdaniji način za stvarni stereo VU bez drugog browser audio streama.

## Povezani dokumenti

- [`SAFARI-TEST-REPORT.md`](SAFARI-TEST-REPORT.md) — detaljni testovi i povijest verzija;
- [`VU-OPERATIONS.md`](VU-OPERATIONS.md) — lokacije koda, rad i provjera;
- [`WORDPRESS-COPY-PASTE.md`](WORDPRESS-COPY-PASTE.md) — WordPress deployment;
- [`../server-vu/README.md`](../server-vu/README.md) — instalacija i održavanje servisa.
