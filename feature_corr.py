"""
feature_corr.py — Multi-algorithm feature importance utilities (optional module).

Not used by the Streamlit app; kept for offline experimentation.
Requires the optional extras in requirements.txt: xgboost, lightgbm, eli5.
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from xgboost import XGBClassifier
from lightgbm import LGBMClassifier
from eli5.sklearn import PermutationImportance


class FeatureImportance:
    """Rank features via several models and intersect the top results."""

    def __init__(self, X: pd.DataFrame, y):
        self.X = X
        self.y = y

    def _rank(self, model) -> pd.Index:
        model.fit(self.X, self.y)
        return self.X.columns[np.argsort(model.feature_importances_)[::-1]]

    def sklearn_importance(self) -> pd.Index:
        return self._rank(RandomForestClassifier(random_state=42))

    def xgboost_importance(self) -> pd.Index:
        return self._rank(XGBClassifier(random_state=42))

    def lightgbm_importance(self) -> pd.Index:
        return self._rank(LGBMClassifier(random_state=42, verbose=-1))

    def eli5_importance(self) -> pd.Index:
        model = RandomForestClassifier(random_state=42)
        model.fit(self.X, self.y)
        perm = PermutationImportance(model, random_state=42).fit(self.X, self.y)
        return self.X.columns[np.argsort(perm.feature_importances_)[::-1]]

    def consensus_columns(self) -> set:
        """Columns ranked top-N by all four methods."""
        sklearn_cols = self.sklearn_importance()
        xgboost_cols = self.xgboost_importance()
        lightgbm_cols = self.lightgbm_importance()
        eli5_cols = self.eli5_importance()
        n = min(len(sklearn_cols), len(xgboost_cols), len(lightgbm_cols), len(eli5_cols))
        return (
            set(sklearn_cols[:n])
            & set(xgboost_cols[:n])
            & set(lightgbm_cols[:n])
            & set(eli5_cols[:n])
        )
