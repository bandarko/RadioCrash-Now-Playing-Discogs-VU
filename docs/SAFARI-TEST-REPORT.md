# Radio Crash VU — Safari test i server-side rješenje

Datum testa: 24. 9. 2026.

## Testno okruženje

- Safari 26.6.2 / AppleWebKit 605.1.15
- stvarni stream: `https://live.radiocrash.net/live.mp3`
- codec potvrđen s `ffprobe`: AAC, 44.1 kHz, stereo
- jedan postojeći `HTMLAudioElement`
- jedan `MediaElementAudioSourceNode`
- dva `AnalyserNode` objekta, L i R
- bez drugog browser audio streama i bez fake animacije

## Rezultati

| Test | Reprodukcija | AudioContext | Analyser RMS | LED |
| --- | --- | --- | --- | --- |
| Radio Crash stream izravno | radi, vrijeme raste | `running` | `0.000000` | 0 |
| Isti Radio Crash stream preko same-origin proxyja, `audio/aacp` | radi | `running` | `0.000000` | 0 |
| Isti stream preko same-origin proxyja, zaglavlje `audio/mpeg` | radi | `running` | `0.000000` | 0 |
| Lokalno generirani kontinuirani MP3 stream | radi | `running` | `0.000000` | 0 |
| Lokalna konačna stereo WAV datoteka | radi | `running` | oko `0.32` | 13 |

Dodatne provjere:

- `crossOrigin="anonymous"` postavljen je prije `src`.
- CORS odgovor streama sadrži `Access-Control-Allow-Origin: *`.
- I `getByteTimeDomainData()` i `getFloatTimeDomainData()` vraćaju nulu na live streamu.
- Spajanje analysera izravno u obaveznu audio signalnu putanju također vraća nulu.
- Safari u ovom testu nema `HTMLMediaElement.captureStream()` alternativu.
- Isti VU kod ispravno analizira konačnu audio datoteku, što potvrđuje da su VU računanje, LED animacija i Web Audio graph ispravni.

## Zaključak browser-side testa

Problem nije u Radio Crash JavaScriptu, CORS-u, vremenu spajanja ni CSS-u. Safari/WebKit ne predaje sirove uzorke kontinuiranog Icecast/Shoutcast streama u `MediaElementAudioSourceNode`; reprodukcija radi, ali analyser dobiva isključivo nule.

To odgovara otvorenom WebKit problemu [180696 — createMediaElementSource() not working with Hls stream](https://bugs.webkit.org/show_bug.cgi?id=180696). Prijava izričito navodi i Icecast streamove, a noviji komentari opisuju isti slučaj: zvuk radi, dok analyser u Safariju vraća sve nule.

## Implementirano rješenje

Na streaming server instaliran je `rc-vu.service`. Jedan FFmpeg proces čita postojeći lokalni Shoutcast stream, izračunava stereo RMS/peak i objavljuje samo brojčane podatke:

- `https://live.radiocrash.net/vu/status`
- `https://live.radiocrash.net/vu/events`

Servis ne snima zvuk i ne šalje audio posjetiteljima. Safari preko SSE-a prima samo JSON s L/R razinama. Chrome, Firefox i Brave i dalje koriste lokalni analyser postojećeg playera.

## Završni Safari test

- Safari 26.6.2 / AppleWebKit 605.1.15
- način rada: `server-safari`
- 100 uzastopnih `level` događaja bez greške
- stvarne vrijednosti primljene s live servera
- LED rezultat tijekom testa: 15/15 segmenata, s daljnjim promjenama prema signalu
- Stop: trenutačni povratak na 0/0 i zatvaranje SSE veze
- server nakon Stop: `clients: 0`

Time je za Safari ostvarena opcija 3: pravi VU bez fake animacije i bez drugog audio streama u browseru.

## Kalibracija v3.1

Prva server-side verzija linearno je preslikavala raspon od -48 do -3 dBFS na 18 LED segmenata. To je tipičan glazbeni RMS od oko -14 dBFS prikazivalo previsoko, približno 14 segmenata.

Verzija v3.1 koristi istu računicu kao postojeći Chrome analyser: `10^(dBFS/20) × 24`. Na izmjerenom live signalu rezultat se promijenio s pogrešnih 12–16 na približno 3–10 segmenata. U usporednom testu Safari je pokazivao 6/7, a produkcijski Chrome 8/9 segmenata.

Safari sada također čeka stvarni `playing` događaj. Tijekom simuliranog sporog pokretanja ostao je na 0/0 bez SSE veze, a feed se otvorio tek kada je player zaista počeo svirati. Renderiranje je optimizirano tako da DOM mijenja samo segmente čije se stanje promijenilo.

## Low-latency v3.2

Dana 24. 9. 2026. produkcijski servis prebačen je s 10 na 25 mjerenja u sekundi, a vremenski buffer smanjen je s 5,0 na 1,5 sekundi. Javni endpoint izmjeren je na točno 25,0 poruka/s; servis je ostao stabilan i bez grešaka.

JavaScript v3.2 prihvaćao je rast razine trenutačno, kao postojeći Chrome VU, dok se decay primjenjivao samo pri padu. Ponovljeni test u Safariju 26.6.2 potvrdio je: 0/0 bez SSE veze prije `playing`, aktivan `server-real` feed bez SSE greške nakon `playing`, odvojene L/R razine te povratak na 0/0 i zatvaranje veze nakon Stop.

## Live-match v3.3

Produkcijski servis 24. 9. 2026. prebačen je na 60 mjerenja/s. Svaki paket koristi RMS zadnjih 256 stereo uzoraka, jednako `fftSize=256` lokalnog Chrome/Firefox/Brave analysera. Izmjerena izlazna brzina bila je 59,99 poruka/s uz približno 2,6 % CPU-a za Python i 1,2 % za FFmpeg u staging testu.

Safari Stop sada radi `unload()` na postojećem SoundManager objektu. Time se zatvara zastarjeli AAC buffer koji je nakon ponovljenih Stop/Play ciklusa uzrokovao preskakanje, digitalne artefakte ili nestanak zvuka. Ne stvara se drugi `Audio` objekt.

Izolirani Safari test prošao je 5/5 ciklusa: pet otvaranja SSE veze, 50 obrađenih level paketa, pet `unload()` zatvaranja, bez greške i s LED povratkom na 0/0 nakon svakog Stop.

## Odbačeni display-sync pokus v3.4

Iskušano je crtanje najnovije stvarne SSE razine jednom po `requestAnimationFrame` frameu. Izolirani regresijski test prošao je 5/5 Stop/Play ciklusa, ali je korisnička provjera na stvarnoj produkcijskoj stranici pokazala lošije, tromije kretanje nego u v3.3.

Zato je v3.4 odbačen i klijentski kod vraćen na izravno crtanje svakog SSE događaja iz v3.3. Serverskih 60 mjerenja/s, 256-frame analiza, gain, stereo razdvajanje, 1,5 s buffer i Safari `unload()` popravak ostali su nepromijenjeni.
