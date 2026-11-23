# How We Built It: The Project in Plain Language

**The question:** when someone gets into a New York taxi, can we guess **how long the ride will take** and
**what the meter will show**, using only what we know at that moment?

**Try it:** https://nyc-taxi-prediction.streamlit.app/

For the full technical details, see [PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md).

---

## The workflow at a glance

```
1. Get the data  →  2. Clean it  →  3. Explore it  →  4. Build features
        →  5. Split by time  →  6. Predict duration  →  7. Predict fare
        →  8. Test once  →  9. Check errors  →  10. Build the app
```

---

## Step 1: Get the data

**What we did:** downloaded every Yellow and Green taxi trip in New York for all of 2025 from the city's
taxi commission (TLC), plus taxi zone maps, hourly weather from Central Park and the list of public holidays.

**Why:** a full year covers every season, holiday and type of weather.

**Result:** **49.3 million trips** (48.7M Yellow, 0.6M Green) in 24 monthly files.

---

## Step 2: Clean it

**What we did:** removed trips that can't be real or can't be used:
- trips with negative or crazy durations (one said −51,000 minutes, another lasted 10 days)
- trips under 1 minute or over 3 hours
- trips with an unknown pickup or drop-off zone
- trips with a fare of zero, a negative fare, or a fare over $500
- exact duplicates

**Why:** broken meter readings would teach the model nonsense.

**Result:** **45.07 million clean trips**. We kept 91% of Yellow trips and 95% of Green trips.

---

## Step 3: Explore it

**What we did:** looked at charts of trip times by hour, weekday, month, borough and taxi type.

**What we learned:**
- **Where you go matters most.** Trips inside one borough take 12–18 min; trips between boroughs take 27–65 min.
- **When you go matters less.** There are about 3 minutes between a late-night trip and a weekday afternoon trip.
- **Trips got slower through the year.** November and December were the slowest months.
- **Yellow cabs outnumber Green cabs 80 to 1.** Yellow mostly drives in Manhattan; Green mostly drives in the outer boroughs.

---

## Step 4: Build features (the clues the model uses)

**What we did:** turned each trip into clues that are **known before the ride starts**:
- **Where:** pickup and drop-off zone, borough, airport or not, and the straight-line distance between the two zones
- **When:** hour, weekday, month, weekend, rush hour, holiday
- **Weather:** temperature, rain, snow, wind
- **History:** the average time and fare of the same route **in earlier months only**
- **Taxi type:** Yellow or Green

**Why "known before the ride":** the meter distance, drop-off time and tips are only known after the trip.
Using them would be cheating, because the app can't know them when you ask for an estimate.

**Why "earlier months only":** if January trips could see December's averages, the model would be peeking
into the future and look better than it really is.

---

## Step 5: Split by time

**What we did:**
- **Train** on January–August (the model learns from these)
- **Validate** on September–October (we compare models and pick the best one)
- **Test** on November–December (scored only **once**, at the very end)

To keep training fast we used 1 million Yellow trips per training run, but **every** Green trip.

**Why:** in real life you predict the future from the past, so the split follows time. Keeping all Green trips
makes sure the model works for Green cabs too, not just for Yellow.

---

## Step 6: Predict trip duration (Stage 1)

**What we did:** started with simple guesses and then tried 7 machine learning models.

| Approach | Average error (validation) |
|---|---|
| Guess the typical trip time for everyone | 9.5 min |
| Guess the average time of that route | 5.1 min |
| Linear regression | 5.0 min |
| K-nearest neighbours | 5.1 min |
| Decision tree | 4.5 min |
| Random forest | 4.4 min |
| XGBoost | 4.4 min |
| **LightGBM (chosen)** | **4.4 min** |
| HistGradientBoosting | 4.4 min |

**Why LightGBM:** it ties with the best model but trains almost 4× faster, and it's easy to save and use in an app.

---

## Step 7: Predict the fare (Stage 2)

**What we did:** trained a second LightGBM model to predict the fare. Its clues are the same as Stage 1
**plus the duration that Stage 1 predicted**.

**Why two stages:** a longer ride costs more, so the predicted duration is a strong clue for the fare. We
use the *predicted* duration, not the real one, because the real one isn't known before the ride.

**Result:** about **$3.93** average fare error on validation (guessing the typical fare gives $10).

---

## Step 8: The final test (November–December)

We retrained both models on January–October and tested them **once** on November–December, which they had never seen.

| | Average error | How much it explains (R²) |
|---|---|---|
| **Duration** | **4.6 min** | 76% |
| **Fare** | **$5.04** | 71% |

- The simple "route average" guess was off by 5.2 min, so the model is clearly better.
- The test error is a bit higher than on validation (4.6 vs 4.4 min) because Nov–Dec traffic is slower.
- If we knew the real duration, the fare error would drop to $3.66. So about a quarter of the fare error comes from not knowing exactly how long the ride will take.

---

## Step 9: Does knowing the taxi type help?

This was our research question. We tested four set-ups on the November–December test months:

| Set-up | Yellow error | Green error |
|---|---|---|
| One model for both, **told** the taxi type | **4.72 min** | **4.39 min** |
| One model for both, **not told** the taxi type | 4.74 | 4.47 |
| A separate model for each taxi type | 4.77 | 4.44 |
| Use the *other* taxi type's model | 5.64 | 4.94 |

**Answer:** yes, a little. One shared model that knows the taxi type is best for both. Green cabs benefit most,
because they learn from all the Yellow trips while still knowing that they're different. Using a Yellow-only model
for Green (or the reverse) works badly, because the two drive in different parts of the city.

---

## Step 10: Check where it goes wrong

- **Short trips are easy, long trips are hard.** Trips under 20 minutes are off by about 3.3 min; trips over an hour are off by about 18 min.
- **The model plays it safe.** It slightly over-guesses short trips and under-guesses long ones.
- **The route's history is the most important clue,** followed by distance, then time of day and weekday. Weather barely matters at city level.

---

## Step 11: Build the app

**What we did:** built a one-page Streamlit app and put it online.
You pick pickup and drop-off, the time, the taxi type and the weather. The app shows the estimated time and fare,
a map of the route, and a Yellow vs Green comparison.

**Why it matches the notebook:** the app builds the clues exactly the way the notebook does, and its route history
comes from all 45 million clean trips. A model is only as good as the clues it gets in real use.

---

## Key takeaways

1. **Location beats everything.** Which route you take explains most of the trip time; the time of day comes second.
2. **History is the best clue.** "How long did this route take before?" is the single most useful piece of information.
3. **No peeking at the future.** Splitting by time and using only past history keeps the results honest.
4. **Simple guesses are a good yardstick.** The route average already gets within about 5 minutes; our model improves on that by about 0.6 minutes.
5. **Taxi type helps a little,** and one shared model beats separate ones.
6. **The leftover error is mostly luck:** traffic lights, accidents and driver habits that nobody can know before the ride.
7. **Limits:** it's an estimate, not live navigation. It uses city-wide weather, covers only 2025, and would need retraining for another year.
