import matplotlib.pyplot as plt
import seaborn as sns
from matplotlib.backends.backend_pdf import PdfPages
from datetime import datetime

def generate_slm_report(pdf_path, slm, df_clean, dep_var, indep_vars):
    accent1, accent2, bg = "#00ff9d", "#f7c800", "#151922"
    with PdfPages(pdf_path) as pp:
        # Title Page
        fig, ax = plt.subplots(figsize=(8.27, 11.69))
        fig.patch.set_facecolor(bg); ax.axis("off")
        ax.text(0.5, 0.8, "Spatial Lag Model (SLM) Report", ha="center", fontsize=20, color=accent2, fontweight="bold")
        ax.text(0.5, 0.7, "Bureau of Local Government Finance — GIS-AI Suite", ha="center", fontsize=12, color=accent1)
        ax.text(0.5, 0.55, f"Dependent Variable: {dep_var}", ha="center", fontsize=11, color="white")
        ax.text(0.5, 0.5, f"Independent Variables: {', '.join(indep_vars)}", ha="center", fontsize=10, color="#ccc")
        ax.text(0.5, 0.35, f"Generated: {datetime.now():%B %d, %Y — %I:%M %p}", ha="center", fontsize=9, color="#aaa")
        pp.savefig(fig, facecolor=bg); plt.close(fig)

        # Summary
        fig, ax = plt.subplots(figsize=(8, 2.5)); ax.axis("off"); fig.patch.set_facecolor(bg)
        metrics = [["Metric", "Value"], ["AIC", f"{slm.aic:.3f}"], ["Pseudo R²", f"{slm.pr2:.4f}"], ["Observations", f"{len(df_clean)}"], ["Variables", f"{len(indep_vars)}"]]
        table = ax.table(cellText=metrics, loc="center", cellLoc="center")
        for (i, j), cell in table.get_celld().items():
            cell.set_edgecolor("#333")
            if i == 0:
                cell.set_facecolor(accent2)
                cell.get_text().set_color("black"); cell.get_text().set_fontweight("bold")
            else:
                cell.set_facecolor(bg); cell.get_text().set_color("white")
        table.scale(1, 1.3)
        pp.savefig(fig, facecolor=bg); plt.close(fig)

        # Coefficients
        fig, ax = plt.subplots(figsize=(7.5, 4))
        fig.patch.set_facecolor(bg)
        sns.barplot(x=indep_vars, y=slm.betas.flatten()[1:], ax=ax, color=accent1)
        ax.set_title("Feature Coefficients", color=accent2, fontsize=13, weight="bold", pad=10)
        ax.set_ylabel("Coefficient Value", color="white")
        ax.tick_params(axis="x", rotation=45, colors="white")
        ax.tick_params(axis="y", colors="white")
        ax.spines[:].set_color("#555")
        pp.savefig(fig, facecolor=bg); plt.close(fig)

        # Residuals
        fig, ax = plt.subplots(figsize=(7.5, 4))
        fig.patch.set_facecolor(bg)
        sns.histplot(df_clean["residual"], kde=True, ax=ax, color=accent1)
        ax.set_title("Residuals Distribution", color=accent2, fontsize=13, weight="bold", pad=10)
        ax.set_xlabel("Residual Value", color="white")
        ax.set_ylabel("Frequency", color="white")
        ax.tick_params(colors="white"); ax.spines[:].set_color("#555")
        pp.savefig(fig, facecolor=bg); plt.close(fig)

        # Residual Map
        try:
            fig, ax = plt.subplots(figsize=(6, 6))
            fig.patch.set_facecolor(bg)
            df_clean.plot(column="residual", ax=ax, cmap="coolwarm", edgecolor="black", linewidth=0.3, legend=True,
                          legend_kwds={"shrink": 0.6, "label": "Residual Value"})
            ax.set_title("Spatial Distribution of Residuals", color=accent2, fontsize=13, weight="bold", pad=10)
            ax.axis("off")
            pp.savefig(fig, facecolor=bg)
            plt.close(fig)
        except Exception as e:
            print(f"⚠️ Residual map skipped: {e}")
