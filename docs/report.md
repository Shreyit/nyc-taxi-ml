# NYC Taxi Trip Duration Prediction

## Group A

#### Name : Aditi Ranjan , Anjali Arya, Hriman Shah, Shreyit Sinha

#### Course: Introduction to Machine Learning, BS Analytics (Batch 2024–2028)

#### School of Analytics, Tata Institute of Social Sciences

#### Mini Project, Group Assignment

#### Submitted to Dr. Purushottam Bhandare

### Live app link to see and use the prediction - https://nyc-taxi-prediction.streamlit.app/

### Code (GitHub repository) - https://github.com/Shreyit/nyc-taxi-ml

## Contents

- Project Summary
- 1\. Introduction
    - 1.1 Practical problem
    - 1.2 Framing the Problem as a Machine Learning Task
    - 1.3 Research Question
- 2\. Data Description
    - 2.1 Data Sources and Size
    - 2.2 Key Variables
    - 2.3 Findings and Issues from EDA
- 3\. Preprocessing
    - 3.1 Problems in the Raw Data
    - 3.2 Cleaning Rules
    - 3.3 Missing Values
    - 3.4 Feature Engineering
    - 3.5 Encoding and Scaling
    - 3.6 Train, Validation and Test Split
    - 3.7 Sampling
- 4\. Models and Methods
    - 4.1 Baselines
    - 4.2 Comparison Models
    - 4.3 Stage 2: Fare Model
    - 4.4 Experiments for the Research Question
- 5\. Evaluation
    - 5.1 Metrics
    - 5.2 Duration Models on Validation (September–October)
    - 5.3 Fare Models on Validation
    - 5.4 Final Test (November–December)
- 6\. Results and Interpretation
    - 6.1 What the Numbers Mean
    - 6.2 Answer to the Research Question
    - 6.3 Where the Model Goes Wrong
    - 6.4 Which Inputs Mattered
    - 6.5 Did We Need More Data?
- 7\. Limitations and Responsible Use
- 8\. Conclusion
- Appendix
    - A. How to Run the Code
    - B. Reproducibility Notes
    - C. Full List of Model Inputs
- AI Use Declaration
- References

#### List of Figures

- Figure 1: Distribution of trip duration for Yellow and Green
- Figure 2: Median trip duration by hour and weekday
- Figure 3: Median trip duration by month
- Figure 4: Trips and median duration by borough
- Figure 5: Trips removed by each cleaning rule
- Figure 6: Validation MAE of all duration models
- Figure 7: Predicted vs actual duration on the test months
- Figure 8: Research question experiments
- Figure 9: Error by trip length, borough and hour
- Figure 10: Permutation importance and SHAP summary for the duration model
- Figure 11: Learning curve of the duration model

<!-- LaTeX: use \tableofcontents, \listoffigures and \listoftables here; tables get numbered automatically. -->

## Project Summary

#### Problem

When a taxi is hailed in New York, the rider and the driver don't know how long the ride will take or what amount the meter will show. We wanted to predict both before the trip starts.

#### Data

We used all the Yellow and Green taxi trips of 2025 from the NYC Taxi & Limousine Commission (TLC), which is around 49.3 million trips. After cleaning we were left with 45.07 million trips and also added zone maps, hourly weather of Central Park and the public holidays.

#### Method

We built a two-stage model. First a duration model predicts the trip time, then a fare model uses the same inputs plus that predicted time to predict the fare. We trained on data from January to August, picked the best model on September-October and tested it only once on November-December data. We compared simple baselines (like the average time of the route) with Linear Regression, KNN, Decision Tree, Random Forest, XGBoost, HistGradientBoosting and LightGBM.

#### Main finding

Among various models we tested LightGBM worked best. On the November to December test months it was off by 4.63 minutes on average for duration and $5.04 for fare, which is around 0.6 minutes better than just using the route's average time. The route's past travel time was the most useful clue. Knowing the taxi type (Yellow or Green) helped a little, mostly for Green taxis.

## 1. Introduction

#### 1.1 Practical problem:

The Customers (riders) and the drivers want an esitimate fare and time when the taxi is hailed, before the meter data exist.

#### 1.2 Framing the Problem as a Machine Learning Task

We framed the problem as a supervised regression task because all the historical ride data has right records for the question how long the ride took and what the metre charged. Our model learn from thesse past examples.

We used regression because both the answers were continuous numbers (minutes and dollars).

There are two targets:

- duration (in minutes): trip duration in minutes, computed as drop-off time - pickup time and limited to 1-180 minutes.
- fare amount ($) : the market fare in usd, before tips, tolls anf other surcharges.

Our unit of analysis is a single taxi trip. The inputs are only what is known at the moment of pickup i.e., the pickup and drop-off zones, the date and time, taxi type , the weather at that time, and how long the same route took in earlier months. And information added after the trip such ad the meterd distance, drop off time, tip, etc. is excluded.

We solved the two targets in sequence. First, a duration model to predict the trip time. THen a fare model which uses the same input plus the predicted duration we got, this is because a longer ride usually costs more.

#### 1.3 Research Question

Does knowing the taxi type (Yellow or Green) help in predicting the trip duration, after we already know the time, the place and the weather?

This matters because the two taxis work in different parts of the city. Yellow taxis can pick up street hails anywhere but mostly drive in Manhattan and to the airports, while Green taxis are only allowed to pick up street hails in upper Manhattan and the outer boroughs[^borough]. So the same route might behave differently for each.

[^borough]: New York City is divided into five boroughs, which are its largest districts: Manhattan, Brooklyn, Queens, the Bronx and Staten Island. The "outer boroughs" are all of them except Manhattan. In the taxi data, Newark Airport (EWR) is also listed as a separate area.

## 2. Data Description

#### 2.1 Data Sources and Size

| Source | What it contains | Size |
|---|---|---:|
| NYC TLC Yellow taxi trips (2025) | one row per trip: pickup and drop-off time and zone, fare, distance, etc. | 48,722,602 trips |
| NYC TLC Green taxi trips (2025) | same as Yellow | 591,375 trips |
| TLC taxi zones | zone list and zone map of New York | 263 zones |
| Open-Meteo weather | hourly Central Park temperature, humidity, rain, snow and wind | 8,760 hours |
| Python `holidays` library | US public holidays of 2025 | 365 days |

The trip records come as 24 monthly files (12 for each taxi type), **49,313,977 trips** in total. Yellow trips are about 80 times more than Green trips (98.8% vs 1.2%).

> [Table: Trips per month by taxi type, notebook §2]

#### 2.2 Key Variables

| Variable | What it is | How we used it |
|---|---|---|
| pickup time | date and time the meter started | input (hour, weekday, month, holiday, etc.) |
| drop-off time | date and time the meter stopped | only to compute duration (target) |
| pickup zone, drop-off zone | TLC zone number (1–263) | input (borough, airport, distance, route history) |
| fare_amount | metered fare in $ | target of stage 2 |
| taxi type | Yellow or Green | input (`is_green`) |
| trip_distance | distance on the meter | not used, only known after the trip |
| tips, tolls, surcharges | extra money added to the bill | not used, only known after the trip |
| passenger_count | number of riders typed by the driver | not used, missing in 24% of Yellow trips |

> [Table: Full list of the 42 model inputs, see Appendix]

#### 2.3 Findings and Issues from EDA

- **The trip time is right-skewed:** most trips take 8 to 22 minutes (median 13.6 minutes for Yellow and 12.8 for Green), but a few take more than an hour. Because of this we mainly use MAE to measure error.
- **Where you go matters the most:** trips inside the same borough take around 12 to 18 minutes, while trips between boroughs take 27 to 65 minutes.
- **When you go matters less:** there are only about 3 minutes of difference between a late night trip and a weekday afternoon trip.
- **Trips got slower over the year:** November and December, our test months, were the slowest.
- **Yellow and Green are different:** 86.7% of Yellow pickups are in Manhattan, compared to 61.5% for Green.

> [Figure 1: Distribution of trip duration for Yellow and Green, notebook §4.1]
> [Figure 2: Median trip duration by hour and weekday, notebook §4.2]
> [Figure 3: Median trip duration by month, notebook §4.3]
> [Figure 4: Trips and median duration by borough, notebook §4.4]

## 3. Preprocessing

#### 3.1 Problems in the Raw Data

The raw data had many trips that can't be real:

- **Wrong times:** some trips had a negative duration (as low as -51,472 minutes) and some lasted more than 10 days (14,881 minutes), mostly because the meter was not stopped or the clock was wrong.
- **Wrong fares:** some fares were zero or negative (as low as -$470), from cancelled or refunded trips. This was 5.9% of Yellow trips.
- **Unknown zones:** zones 264 and 265 mean "unknown", so we can't place the trip on the map.
- **Wrong month:** a few trips had a pickup date outside the month of their file (some even from 2007-2008).
- **Duplicates:** 4,809 Yellow and 41 Green trips were exact copies.

#### 3.2 Cleaning Rules

We applied the rules one by one and counted how many trips were left after each step:

| Step | Yellow | Green |
|---|---:|---:|
| Raw trips | 48,722,602 | 591,375 |
| Pickup in the file's month | 48,722,388 | 591,127 |
| Duration between 1 and 180 minutes | 47,612,696 | 566,679 |
| Known pickup and drop-off zone | 47,271,764 | 562,059 |
| Fare more than $0 and up to $500 | 44,511,604 | 559,036 |
| Duplicates removed | **44,511,603** | **559,036** |

In the end we kept **45.07 million trips** (91.4% of Yellow and 94.5% of Green). We did not remove trips where the meter showed 0 miles, because we never use the meter distance as an input.

> [Figure 5: Trips removed by each cleaning rule, notebook §3.4]

#### 3.3 Missing Values

- **passenger_count** was missing in 23.8% of Yellow trips and is typed in by the driver, so we dropped it.
- **Route history** (explained in 3.4) is missing when a route was never taken in the earlier months. In that case we use the pickup zone's history, and if that is also missing we use the median trip time of the training data. In January there are no earlier months, so every January trip uses this fallback; from February onwards less than 0.4% of trips needed it.
- Other variables like pickup time, drop-off time and zones had no missing values.

#### 3.4 Feature Engineering

From each trip we built 42 inputs, all known before the trip starts:

| Group | Features |
|---|---|
| Location | straight-line distance between zone centres (`centroid_km`), grid distance (`grid_km`), pickup and drop-off borough, airport pickup/drop-off, same zone, same borough |
| Time | hour (also as sin and cos so that 23:00 and 00:00 are close), weekday, month, week of year, weekend, rush hour, holiday |
| Weather | temperature, humidity, rain, snow, wind, is it raining |
| Route history | average duration and fare of the same route, and of the pickup zone, from earlier months |
| Taxi type | `is_green` |

**Route history from earlier months only:** for a trip in a given month, we only use trips from the months before it. For example, a trip from JFK Airport to Times Square in February uses only January's 5,102 trips on that route (average 50.6 minutes). If we used the whole year's average, a January trip would "see" December's traffic, which would be like peeking into the future.

> [Table: Route history of JFK Airport → Times Square growing month by month, notebook §5.3]

#### 3.5 Encoding and Scaling

- **Borough** was turned into 0/1 columns (one-hot encoding).
- **Zone numbers** were kept as numbers for the tree models, which can split on them. They were left out of Linear Regression and KNN, because there zone 132 is not "bigger" than zone 4.
- **Scaling** (StandardScaler) was used only for Linear Regression and KNN. Tree models don't need it.

#### 3.6 Train, Validation and Test Split

We split the data by time and not randomly, because in real life we predict the future from the past:

| Split | Months | Yellow trips | Green trips | Used for |
|---|---|---:|---:|---|
| Train | January–August | 28,900,375 | 375,907 | learning |
| Validation | September–October | 7,832,264 | 93,145 | comparing models and tuning |
| Test | November–December | 7,778,964 | 89,984 | final score, used only once |

#### 3.7 Sampling

Because training on 29 million Yellow trips would be very slow, so we took a fixed random sample of Yellow trips (1,000,000 for train and 250,000 each for validation and test) but kept **every Green trip**. This gives 1,375,907 training trips, of which 27% are Green. If we had sampled both the same way, the model would have seen too few Green trips to learn them well.

## 4. Models and Methods

#### 4.1 Baselines

Before training any model we made three simple guesses, so we know what a model has to beat. The first gives every trip the same median duration. The second gives each trip the median duration of its route in the training data. The third uses the route history from earlier months (the same feature from 3.4) directly as the prediction. If a model can't beat the route history, it is not learning anything new.

#### 4.2 Comparison Models

We started with the simpler **Linear Regression**, but it can only draw straight lines, while trip time does not grow in a straight line with distance or hour. **KNN** predicts a trip from the most similar past trips, which makes sense for taxis, but it is slow on big data, so we used FAISS to search faster and trained it on a 300,000 trip sample.

A **Decision Tree** can learn rules like "airport trip in rush hour takes longer", which suits our data better. We tried depths from 5 to 20 and picked depth 10, because deeper trees started to overfit. **Random Forest** averages many such trees to reduce overfitting, and the three boosting models, **HistGradientBoosting, XGBoost and LightGBM**, build trees one after another where each tree fixes the mistakes of the last one. Boosting models are usually the strongest on table data like ours.

All models were trained on January–August and compared on September–October. The settings of each model (like tree depth or number of leaves) were also chosen on September–October, so the test months stayed untouched.

#### 4.3 Stage 2: Fare Model

For the fare we used the same inputs plus the predicted duration from stage 1, and compared Linear Regression, Random Forest, XGBoost and LightGBM against two baselines (the median fare and the route's past fare). One problem here is that if the duration model predicts its own training trips, it is almost too accurate, and the fare model would learn to trust it too much. So for the training data we split it into 5 parts and predicted each part with a duration model trained on the other 4 (out-of-fold prediction), which gives the fare model realistic durations.

#### 4.4 Experiments for the Research Question

To check if taxi type helps, we trained the best model in four ways and compared them on the test months:

| Setup | Trained on | Knows taxi type? |
|---|---|---|
| C1 | Yellow and Green together | yes |
| C2 | Yellow and Green together | no |
| A/B | only its own taxi type | no |
| D/E | only the other taxi type | no |

C1 vs C2 tells us if knowing the taxi type helps, C1 vs A/B tells us if one shared model is better than two separate ones, and D/E shows how different the two taxi types really are.

## 5. Evaluation

#### 5.1 Metrics

Our main metric is **MAE** (mean absolute error), which is simply how many minutes, or dollars, a prediction is off on average. We chose it because it is easy to understand and because a few very long trips don't blow it up. We also report **RMSE**, which punishes big misses more, and **R²**, which tells how much of the variation in trip time the model explains. Since our sample has 27% Green trips while the real data has only 1.2%, we report MAE for Yellow and Green separately as well.

#### 5.2 Duration Models on Validation (September–October)

| Model | MAE (min) | RMSE (min) | R² | Yellow MAE | Green MAE |
|---|---:|---:|---:|---:|---:|
| Baseline: overall median | 9.48 | 15.29 | -0.14 | 9.85 | 8.48 |
| Baseline: route median | 5.39 | 9.45 | 0.57 | 5.56 | 4.95 |
| Baseline: route history | 5.08 | 8.30 | 0.66 | 5.19 | 4.77 |
| Linear Regression | 5.04 | 8.10 | 0.68 | 5.15 | 4.75 |
| KNN (k = 25) | 5.08 | 8.16 | 0.68 | 5.12 | 4.98 |
| Decision Tree (depth 10) | 4.50 | 7.37 | 0.74 | 4.52 | 4.43 |
| Random Forest | 4.42 | 7.33 | 0.74 | 4.46 | 4.31 |
| XGBoost | 4.38 | 7.25 | 0.74 | 4.43 | 4.23 |
| **LightGBM** | **4.37** | 7.28 | **0.74** | 4.43 | **4.21** |
| HistGradientBoosting | 4.36 | 7.27 | 0.74 | 4.42 | 4.23 |

Linear Regression and KNN were only as good as the route history baseline, while all the tree models beat it. The three boosting models were almost equal, so we chose **LightGBM** because it trained in 21 seconds compared to 78 seconds for HistGradientBoosting.

> [Figure 6: Validation MAE of all duration models, notebook §7.7]

#### 5.3 Fare Models on Validation

| Model | MAE ($) | RMSE ($) | R² |
|---|---:|---:|---:|
| Baseline: overall median | 10.00 | 16.79 | -0.12 |
| Baseline: route fare history | 4.35 | 8.33 | 0.73 |
| Linear Regression | 4.59 | 8.58 | 0.71 |
| Random Forest | 4.03 | 7.50 | 0.78 |
| XGBoost | 3.98 | 7.36 | 0.79 |
| **LightGBM** | **3.93** | **7.31** | **0.79** |

LightGBM was again the best, so both stages use it.

#### 5.4 Final Test (November–December)

We retrained both LightGBM models on January–October and scored them once on the test months.

| | All | Yellow | Green |
|---|---:|---:|---:|
| Duration MAE (min) | **4.63** | 4.72 | 4.39 |
| Duration R² | 0.76 | 0.77 | 0.70 |
| Route history baseline MAE (min) | 5.22 | 5.40 | 4.72 |
| Fare MAE ($) | **5.04** | 5.17 | 4.67 |
| Fare R² | 0.71 | 0.74 | 0.58 |
| Fare MAE if real duration was known ($) | 3.66 | 3.81 | 3.24 |

> [Figure 7: Predicted vs actual duration on the test months, notebook §7.10]

## 6. Results and Interpretation

#### 6.1 What the Numbers Mean

On trips the model had never seen, the predicted trip time was off by about 4.6 minutes on average. Simply using the route's past average was off by 5.2 minutes, so the model is around 0.6 minutes better. That doesn't sound like much, but the route history already captures most of what can be known before a trip, and the model improves on it for both taxi types. The error on test (4.63) is a bit higher than on validation (4.37). This is not overfitting: as we saw in the EDA, November and December were the slowest months of the year, so they were harder to predict.

For the fare, the model was off by $5.04 on average. If we had known the real trip time, it would have been $3.66, so around a quarter of the fare error comes from not knowing exactly how long the ride will take.

#### 6.2 Answer to the Research Question

| Setup | Yellow MAE (min) | Green MAE (min) |
|---|---:|---:|
| C1: together, knows taxi type | **4.72** | **4.39** |
| C2: together, doesn't know taxi type | 4.74 | 4.47 |
| A/B: own taxi type only | 4.77 | 4.44 |
| D/E: other taxi type only | 5.64 | 4.94 |

Knowing the taxi type helps, but only a little, and mostly for Green taxis (4.47 to 4.39 minutes). One shared model that knows the taxi type was better than two separate models, because Green taxis can learn from the much larger number of Yellow trips on the same streets. But a model trained only on one taxi type does badly on the other, which shows that Yellow and Green trips really are different.

> [Figure 8: Research question experiments, notebook §7.9]

#### 6.3 Where the Model Goes Wrong

The model is good at short trips and weak at long ones. Trips under 20 minutes are off by about 3.3 minutes, while trips over an hour are off by about 18 minutes. It also slightly over-predicts short trips and under-predicts long ones, which means it pulls unusual trips towards the typical trip time. Long trips are rare and often stuck in traffic that can't be known in advance.

> [Figure 9: Error by trip length, borough and hour, notebook §7.11]

#### 6.4 Which Inputs Mattered

The route's past travel time was by far the most important input: shuffling it made the error worse by about 4.5 minutes. Next was the distance between the two zones (about 1.8 minutes), and then the hour and weekday. Weather mattered very little, probably because we only have one weather station for the whole city. These importances show what the model relies on, not what causes a trip to be slow. For example, the model can't tell us that rain causes delays, only that rain was not very useful for its predictions.

> [Figure 10: Permutation importance and SHAP summary for the duration model, notebook §7.12]

#### 6.5 Did We Need More Data?

When we trained on bigger samples, the error fell quickly at first (4.85 minutes with 10,000 trips) and then slowly (4.47 with 500,000 and 4.37 with the full 1.38 million). So using all 45 million trips would most likely give only a small gain for a lot more computing time.

> [Figure 11: Learning curve of the duration model, notebook §7.13]

## 7. Limitations and Responsible Use

**Data privacy:** the TLC trip records are public and de-identified. They have no names, card details or exact addresses, only one of 263 zones for the pickup and drop-off, so a trip can't be traced back to a person. This makes the data fine for course use.

**Bias and fairness:** the model does not work equally well everywhere. Green taxis are only 1.2% of the trips, so we kept every Green trip in training, and their error ended up close to Yellow's. But zones with few trips, like Staten Island and Newark Airport, have less route history and higher errors, so riders from these areas get less accurate estimates.

**Interpretability:** we can say which inputs the model relies on (route history, distance and time of day), but not why a trip is slow. A feature being important is not proof that it causes delay.

**Overclaiming:** this is a prediction model, not an explanation of traffic. It does not know about accidents, road closures, events or live traffic, and it uses only one weather station for the whole city. It was trained on 2025, so a new year or a change in taxi rules would need retraining and testing again.

**Practical use:** the estimate is good for giving a rider a rough idea before the trip, as our app does. It should not be used as a fixed price, as a navigation time, or to judge drivers. If a company used it for pricing or dispatch, a person should review the estimates, especially for long, airport and late-night trips where the error is the highest.

## 8. Conclusion

We built a two-stage model that predicts the trip time and fare of a NYC taxi using only what is known when the taxi is hailed. LightGBM was the best model, off by 4.63 minutes and $5.04 on average on November–December. We learned that where you go matters much more than when you go, and that a route's past travel time is the most useful single clue. Splitting the data by time and using only past history kept our results honest. Knowing the taxi type helps a little, and one shared model works better than two separate ones.

In a future version we would use real road routes instead of straight-line distance, add live traffic, give a range of likely times instead of one number, and train on more than one year of data.

## Appendix

#### A. How to Run the Code

The code and data download script are on GitHub (https://github.com/Shreyit/nyc-taxi-ml). It needs Python 3.14 or newer and `uv`.

```bash
git clone https://github.com/Shreyit/nyc-taxi-ml.git
cd nyc-taxi-ml
uv sync
uv run python scripts/get_data.py
```

Then run `notebooks/nyc_taxi_trip_duration.ipynb` from top to bottom. The app can be run with `uv run streamlit run app/streamlit_app.py`, or used online at https://nyc-taxi-prediction.streamlit.app/.

#### B. Reproducibility Notes

All random steps (sampling, model training, cross-validation) use the fixed seed 33, and the exact package versions are saved in `uv.lock`. The trained models are saved in `outputs/models/` and the figures in `outputs/figures/`.

#### C. Full List of Model Inputs

> [Table: all 42 inputs with a one-line description each, from `outputs/models/feature_columns.json`]

## AI Use Declaration

We used AI assistants (Claude Code by Anthropic) in three places in this project. First, for help with the syntax and debugging of the code in our Jupyter notebook. Second, to help us build the Streamlit dashboard. Third, to format this report from our Markdown draft into the academic LaTeX format. The research question, the choice of data, the modelling decisions and the interpretation of the results are our own, and we checked all the code outputs and numbers reported here against our notebook.

## References

#### Data

1. NYC Taxi & Limousine Commission (2025). *TLC Trip Record Data.* https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page
2. Open-Meteo. *Historical Weather API.* https://open-meteo.com/en/docs/historical-weather-api
3. *holidays* Python library documentation. https://python-holidays.readthedocs.io/

#### Models

4. Pedregosa, F. et al. (2011). Scikit-learn: Machine Learning in Python. *Journal of Machine Learning Research*, 12, 2825–2830. https://scikit-learn.org/stable/
5. scikit-learn documentation: Linear Regression. https://scikit-learn.org/stable/modules/linear_model.html#ordinary-least-squares
6. scikit-learn documentation: Decision Trees. https://scikit-learn.org/stable/modules/tree.html
7. scikit-learn documentation: Random Forests and HistGradientBoosting (Ensembles). https://scikit-learn.org/stable/modules/ensemble.html
8. Ke, G. et al. (2017). LightGBM: A Highly Efficient Gradient Boosting Decision Tree. *Advances in Neural Information Processing Systems 30.* Documentation: https://lightgbm.readthedocs.io/
9. Chen, T. & Guestrin, C. (2016). XGBoost: A Scalable Tree Boosting System. *Proceedings of the 22nd ACM SIGKDD Conference*, 785–794. Documentation: https://xgboost.readthedocs.io/
10. Johnson, J., Douze, M. & Jégou, H. (2019). Billion-scale similarity search with GPUs. *IEEE Transactions on Big Data*, 7(3), 535–547. Documentation (FAISS): https://faiss.ai/
11. Lundberg, S. M. & Lee, S.-I. (2017). A Unified Approach to Interpreting Model Predictions. *Advances in Neural Information Processing Systems 30.* Documentation (SHAP): https://shap.readthedocs.io/

#### Tools

12. Raasveldt, M. & Mühleisen, H. (2019). DuckDB: an Embeddable Analytical Database. *Proceedings of the 2019 International Conference on Management of Data (SIGMOD)*, 1981–1984. Documentation: https://duckdb.org/docs/
13. GeoPandas documentation. https://geopandas.org/
14. Streamlit documentation. https://docs.streamlit.io/
