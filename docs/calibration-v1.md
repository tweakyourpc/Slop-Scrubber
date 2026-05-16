# Calibration v1

This pass scores 20 publicly accessible content cards with the production `config/rules.json` after the v4 field-aware publisher fix. The scorer output below is observational only; no weight changes have been applied.

## Test Set

| # | Label | Source | Title | Excerpt used for scoring | Score | Bucket | Matched rules | Assessment |
|---:|---|---|---|---|---:|---|---|---|
| 1 | Human editorial | [NASA](https://www.nasa.gov/missions/artemis/artemis-3/nasa-outlines-preliminary-artemis-iii-mission-plans/) | NASA Outlines Preliminary Artemis III Mission Plans | NASA is defining an Earth-orbit Artemis III test flight to reduce risk before lunar landing missions. | 6 | Human | `title_fragment` | Correct bucket |
| 2 | Human editorial | [NASA Science](https://science.nasa.gov/science-research/ai-foundation-model-in-orbit/) | NASA’s Prithvi Becomes First AI Geospatial Foundation Model In Orbit | Researchers deployed NASA and IBM’s open-source geospatial AI model aboard in-orbit platforms for Earth observation. | 0 | Human | none | Correct bucket |
| 3 | Human editorial | [NASA](https://www.nasa.gov/technology/hello-universe-nasas-next-gen-space-processor-undergoes-testing/) | Hello Universe: NASA’s Next-Gen Space Processor Undergoes Testing | NASA is testing a spaceflight processor designed for deep-space reliability and faster autonomous mission computing. | 6 | Human | `title_fragment` | Correct bucket |
| 4 | Human editorial | [NASA Science](https://science.nasa.gov/solar-system/whats-up-may-2026-skywatching-tips-from-nasa/) | What’s Up: May 2026 Skywatching Tips from NASA | May brings the Eta Aquarid meteor shower, a Moon and Venus meetup, and a rare Blue Moon. | 0 | Human | none | Correct bucket |
| 5 | Human editorial | [NASA Science](https://science.nasa.gov/science-research/heliophysics/nasas-storie-mission-to-tell-tale-of-earths-ring-current/) | NASA’s STORIE Mission to Tell Tale of Earth’s Ring Current | The STORIE mission will study charged particles trapped by Earth’s magnetic field and their space-weather effects. | 0 | Human | none | Correct bucket |
| 6 | Human editorial | [NASA](https://www.nasa.gov/general/blue-origin-moon-lander-completes-testing-at-nasa-vacuum-chamber/) | Blue Origin Moon Lander Completes Testing at NASA Vacuum Chamber | Blue Origin’s MK1 lunar lander completed environmental testing inside a NASA thermal vacuum chamber. | 0 | Human | none | Correct bucket |
| 7 | Human editorial | [NASA](https://www.nasa.gov/directorates/stmd/nasa-industry-advance-high-performance-spaceflight-computing/) | NASA, Industry Advance High Performance Spaceflight Computing | NASA and industry partners advanced a radiation-tolerant processor for future spacecraft missions. | 6 | Human | `title_fragment` | Correct bucket |
| 8 | Human editorial | [NASA](https://www.nasa.gov/technology/computing/nasa-launches-its-most-powerful-efficient-supercomputer/) | NASA Launches Its Most Powerful, Efficient Supercomputer | NASA announced Athena, a supercomputer for mission and research workloads at Ames Research Center. | 6 | Human | `title_fragment` | Correct bucket |
| 9 | Human editorial | [NASA Science](https://science.nasa.gov/science-research/nasa-researchers-probe-tangled-magnetospheres-of-merging-neutron-stars/) | NASA Researchers Probe Tangled Magnetospheres of Merging Neutron Stars | NASA simulations examine magnetic structures around neutron stars before merger and possible observable signals. | 0 | Human | none | Correct bucket |
| 10 | Human editorial | [NASA](https://www.nasa.gov/missions/artemis/nasa-welcomes-ireland-as-newest-artemis-accords-signatory/) | NASA Welcomes Ireland as Newest Artemis Accords Signatory | Ireland signed the Artemis Accords, joining nations committed to responsible space exploration. | 0 | Human | none | Correct bucket |
| 11 | Attention/listicle | [British GQ](https://www.gq-magazine.co.uk/article/need-a-dopamine-hit-eat-more-of-these-healthy-foods-say-several-happy-experts) | Need a dopamine hit? Eat more of these healthy foods, say several happy experts | These dopamine-boosting foods are framed as improving mood, focus, and sex drive. | 0 | Human | none | Likely under-scored |
| 12 | Attention/listicle | [Country Living](https://www.countryliving.com/home-maintenance/organization/a71223325/yard-sale-mistakes/) | 3 Mistakes Sabotaging Your Yard Sale (and How to Fix Them) | Common yard sale mistakes can slow down sales, create stress, and leave sellers with leftovers. | 8 | Human | `headline_like` | Under-scored |
| 13 | Attention/listicle | [Lifehacker via Yahoo Tech](https://tech.yahoo.com/articles/10-hacks-every-microsoft-outlook-143000122.html) | 10 Hacks Every Microsoft Outlook User Should Know | Outlook has useful features that are not always enabled by default for former Gmail users. | 14 | Human | `headline_like`, `title_fragment` | Under-scored |
| 14 | Attention/listicle | [British GQ](https://www.gq-magazine.co.uk/article/7-magnesium-rich-foods-to-help-improve-your-sleep-and-mood) | 7 Magnesium-rich foods to help improve your sleep, and mood | Dietitians explain magnesium-rich foods that may support sleep and mood regulation. | 18 | Human | `headline_like`, `dash_comma_candidate` | Under-scored |
| 15 | Attention/listicle | [British GQ](https://www.gq-magazine.co.uk/lifestyle/article/lost-libido) | 10 habits that might be killing your sex drive | Lifestyle habits can affect energy, mood, and libido over time. | 0 | Human | none | Under-scored due lowercase numeric headline |
| 16 | Sponsored/native | [AZoM](https://www.azom.com/sponsored-articles.aspx) | From Ore Liberation to Processing Particle Size Control in Mining | Particle size distribution affects metal mining efficiency, recovery, and environmental risk. | 35 | Suspect (Highlight) | `sentinel:sponsored` | Correct bucket |
| 17 | Sponsored/native | [AZoM](https://www.azom.com/sponsored-articles.aspx) | Particle Size Analysis of Inks with the Bettersizer 2600 Plus Explained | Pigment particle size and distribution affect ink color strength and viscosity. | 35 | Suspect (Highlight) | `sentinel:sponsored` | Correct bucket |
| 18 | Sponsored/native | [AZoM](https://www.azom.com/article.aspx?ArticleID=25193) | Everything You Should Know About Homogenization Processes and Applications | High-pressure homogenization supports emulsions, particle reduction, liposomes, and vaccine production workflows. | 35 | Suspect (Highlight) | `sentinel:sponsored` | Correct bucket |
| 19 | Native/contributor | [Forbes Business Council](https://www.forbes.com/councils/forbesbusinesscouncil/2026/04/27/the-b2b-buying-journey-doesnt-end-at-search-it-starts-there/) | The B2B Buying Journey Doesn’t End At Search: It Starts There | A council post argues that paid media and structured content are shifting toward workflow-based buying decisions. | 0 | Human | none | Likely under-scored if council/native posts are in scope |
| 20 | Native/contributor | [Forbes Councils](https://www.forbes.com/sites/juliakorn/2026/03/10/mentorship-is-safe-sponsorship-will-transform-womens-careers/) | Mentorship Is Safe. Sponsorship Will Transform Women’s Careers | A contributor argues sponsorship can accelerate advancement more directly than traditional mentorship. | 6 | Human | `title_fragment` | Likely under-scored if council/native posts are in scope |

## Findings

The field-aware publisher fix removes the observed false-positive baseline from publisher names. Clean NASA cards now remain between 0 and 6, which is safely below the `Human` threshold.

The largest miss is numbered/listicle-style content. With `headline_like` at 8, even an obvious numeric headline remains in the `Human` bucket unless it also triggers dash or title-fragment penalties. This is visible in rows 12 through 15.

Sponsored content with an explicit publisher sentinel is handled correctly. AZoM examples with `Sponsored Content` in the publisher field score 35 and land in `Suspect (Highlight)`.

Native/contributor content without explicit sponsored or council sentinel text remains mostly unscored. If Forbes Councils-style material is in scope, this should be handled through metadata/sentinel configuration rather than by broadening prose heuristics.

## Proposed Weight Adjustments

| Key | Current | Proposed | Rationale | Risk |
|---|---:|---:|---|---|
| `headline_like` | 8 | 25 | Numeric-prefix listicle titles should reach `Suspect (Highlight)` on their own after publisher inflation was removed. This would move rows 12, 13, and 14 into Suspect. | Low-medium. It will flag legitimate numbered explainers, but only numeric-prefix headlines with uppercase post-number text. |
| `title_fragment` | 6 | 6 | Keep unchanged. It still appears on some legitimate NASA headlines, but the score remains low and useful as a weak additive signal. | Low. Raising it would increase false positives on normal title-case headlines. |
| `sponsored_sentinel` | 35 | 35 | Keep unchanged. Explicit sponsored/native labels already land in `Suspect (Highlight)`. | Low. |
| `exact_ad_layout_token` | 100 | 100 | Keep unchanged. Exact layout tokens are high-confidence block signals. | Low. |

## Follow-Up Candidates

Add a case-sensitive or explicitly configured metadata sentinel for `Forbes Business Council`, `Forbes Councils`, and similar native-contributor labels if those surfaces are intended to be filtered. This should be a configuration change after review, not a prose heuristic change.

Consider a separate lowercase numeric-headline rule if titles like `10 habits that might be killing your sex drive` are in scope. Do not make `headline_like` case-insensitive again, because that would recreate the Python/JavaScript parity issue fixed in v3 unless both implementations and tests are updated deliberately.
