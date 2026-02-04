# Commander Deck Strength Questionnaire

This is a single-page web application designed to help Magic: The Gathering players gauge the relative power level of their Commander (EDH) decks. The app asks a series of questions, calculates a score, and provides a "deck profile" summary, similar to Spotify Wrapped.

It is built with vanilla HTML, CSS, and JavaScript, with no backend or complex build steps required, making it easy to host on services like GitHub Pages.

## Features

- **Dynamic Questionnaire**: Questions, scoring, and categories are all loaded from a single `config.toml` file.
- **Multiple Question Types**: Supports yes/no toggles, number counters, and multiple-choice questions.
- **Power Level Score**: Calculates a numeric score and assigns a tier (e.g., Casual, Focused, cEDH).
- **"Deck Profile" Graphic**: Generates a shareable summary of your deck's key characteristics (Tutors, Combos, Fast Mana, etc.).
- **Shareable Results**: Encode your answers into a URL to share your deck's profile with others.
- **Browser Persistence**: Your answers are automatically saved in your browser's `localStorage`.
- **Zero Dependencies**: Runs entirely in the browser with no external libraries needed at runtime (the TOML parser is included in the repository).

## How to Run Locally

Since this is a static web app with no build process, you can run it easily:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/BracketBreaker.git
    cd BracketBreaker
    ```
2.  **Start a simple web server.**
    Most operating systems have a simple way to do this. The key is to serve the files from a server rather than opening `index.html` directly from the filesystem, which can cause issues with file-loading (`fetch` requests).

    *   **Using Python 3:**
        ```bash
        python -m http.server
        ```
    *   **Using Node.js (with `serve`):**
        ```bash
        npx serve
        ```
    *   **Using a VS Code Extension:**
        If you use Visual Studio Code, you can install the "Live Server" extension and click "Go Live" from the status bar.

3.  Open your browser and navigate to the address provided by your server (usually `http://localhost:8000`).

## Deploying to GitHub Pages

1.  Push the code to a GitHub repository.
2.  Go to your repository's **Settings** tab.
3.  In the left sidebar, click on **Pages**.
4.  Under "Build and deployment", set the **Source** to **Deploy from a branch**.
5.  Select the branch you want to deploy (e.g., `main`) and keep the folder as `/ (root)`.
6.  Click **Save**.

Your site will be deployed and available at `https://<your-username>.github.io/<your-repo-name>/`.

## How to Customize the Questionnaire

All configuration is done in the `config.toml` file. You can open it in a text editor to make changes.

### Editing Tiers

The `[[tiers]]` section defines the power level labels. They are evaluated from top to bottom; the app assigns the label of the last tier whose `minScore` is met.

```toml
[[tiers]]
  minScore = 0
  label = "Casual"
  color = "#4caf50" # A CSS color for the label

[[tiers]]
  minScore = 15
  label = "Focused"
  color = "#ffc107"
```

### Editing Categories

The `[[categories]]` are used for the "Deck Profile" graphic. Each category is linked to questions via `tags`.

```toml
[[categories]]
  tag = "tutors"         # The internal ID, must match a question's tag
  label = "Tutor Density" # The display name
  icon = "🔍"            # An emoji or symbol
```

### Editing Questions

Each `[[questions]]` block defines a new question card.

-   `id`: A unique identifier.
-   `type`: The input type. Can be `"toggle"`, `"count"`, or `"multiple"`.
-   `name`: A short label for the results breakdown.
-   `prompt`: The main question text.
-   `description`: Optional helper text.
-   `tags`: An array of strings that link this question's score to one or more categories.

#### Scoring

The `scoring` table changes based on the question `type`:

-   **For `type = "toggle"`**:
    -   `weight`: The number of points to add if the toggle is "on" (checked).

    ```toml
    [[questions]]
      id = "stax"
      type = "toggle"
      scoring.weight = 5
      tags = ["stax"]
    ```

-   **For `type = "count"`**:
    -   `weight_per`: Points to add for each number in the counter.
    -   `cap` (optional): The maximum value that will contribute to the score (to prevent single questions from dominating the total).

    ```toml

    [[questions]]
      id = "tutors"
      type = "count"
      scoring.weight_per = 1.5
      scoring.cap = 15
      tags = ["tutors"]
    ```

-   **For `type = "multiple"`**:
    -   `options`: An array of tables, each with a `label` (the text shown to the user) and a `value` (the score for that choice). The last option is selected by default.

    ```toml
    [[questions]]
      id = "combo_pieces"
      type = "multiple"
      scoring.options = [
        { label = "2 cards", value = 6 },
        { label = "3 cards", value = 4 },
        { label = "No specific combos", value = 0 }
      ]
      tags = ["combos"]
    ```

### Tuning Philosophy

The default weights and thresholds are just examples. The goal of this tool is not to be a definitive, objective measure, but a consistent one for a given playgroup. You should tune the `scoring` values in `config.toml` to match what your group considers powerful.

-   **High Impact**: Is winning via a 2-card combo much stronger than winning with a 4-card combo? Give the "2 cards" option a much higher `value`.
-   **"Scary" Cards**: Does your group immediately fear `stax` pieces? Give that question a high `weight`.
-   **Thresholds**: After a few decks have been run through the questionnaire, check their scores. Do they feel right? Adjust the `minScore` values in the `[[tiers]]` section until the labels align with your group's perception.

The power of this tool comes from having a shared, transparent standard for discussion.
