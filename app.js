document.addEventListener('DOMContentLoaded', () => {
    const App = {
        // DOM Elements
        elements: {
            mainTitle: document.getElementById('main-title'),
            mainSubtitle: document.getElementById('main-subtitle'),
            commanderNameInput: document.getElementById('commander-name'),
            commanderImage: document.getElementById('commander-image'),
            commanderImageContainer: document.getElementById('commander-image-container'),
            autocompleteSuggestions: document.getElementById('autocomplete-suggestions'),
            form: document.getElementById('questionnaire-form'),
            resultsSection: document.getElementById('results-section'),
            totalScore: document.getElementById('total-score'),
            tierLabel: document.getElementById('tier-label'),
            resultsBreakdown: document.getElementById('results-breakdown'),
            wrappedCategories: document.getElementById('wrapped-categories'),
            viewResultsBtn: document.getElementById('view-results-btn'),
            resetBtn: document.getElementById('reset-btn'),
            shareBtn: document.getElementById('share-btn'),
        },

        // App state
        state: {
            config: null,
            answers: {},
            commanderName: '',
            commanderImageUrl: null,
            edhrecRank: null,
            currentSuggestions: [],
        },

        // Initialization
        async init() {
            try {
                await this.config.load();
                this.ui.renderGlobalContent();
                this.ui.renderQuestions();
                this.stateManager.loadState();
                this.debouncedHandleCommanderInput = this.debounce(this.handleCommanderInput, 300);
                this.addEventListeners();
                this.handleUrlParams();
            } catch (error) {
                console.error('Initialization failed:', error);
                alert('Failed to load the questionnaire. Please check the console for errors.');
            }
        },

        // Debounce utility
        debounce(func, delay) {
            let timeout;
            return function(...args) {
                const context = this;
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(context, args), delay);
            };
        },

        // Event Listeners
        addEventListeners() {
            this.elements.form.addEventListener('input', (e) => {
                this.stateManager.updateAnswer(e.target.name, e.target.value, e.target.type);
                this.scoring.calculateAndDisplay();
            });
            this.elements.viewResultsBtn.addEventListener('click', () => {
                this.elements.resultsSection.classList.remove('hidden');
                this.elements.resultsSection.scrollIntoView({ behavior: 'smooth' });
            });
            this.elements.resetBtn.addEventListener('click', () => this.stateManager.reset());
            this.elements.shareBtn.addEventListener('click', () => this.stateManager.share());

            // Autocomplete and Commander Image Update
            this.elements.commanderNameInput.addEventListener('input', this.debouncedHandleCommanderInput);
            this.elements.commanderNameInput.addEventListener('blur', () => {
                // Delay hiding to allow click on suggestion
                setTimeout(() => App.ui.clearSuggestions(), 150);
            });
            this.elements.autocompleteSuggestions.addEventListener('click', (e) => {
                if (e.target.classList.contains('suggestion-item')) {
                    const selectedName = e.target.textContent;
                    App.elements.commanderNameInput.value = selectedName;
                    App.handleCommanderUpdate(selectedName); // Trigger full update for selected card
                    App.ui.clearSuggestions();
                }
            });
        },

        debouncedHandleCommanderInput: null, // Initialized in init or at top level

        async handleCommanderInput() {
            const query = App.elements.commanderNameInput.value.trim();
            if (query.length < 2) {
                App.ui.clearSuggestions();
                return;
            }
            const suggestions = await App.scryfall.fetchAutocompleteSuggestions(query);
            App.state.currentSuggestions = suggestions || [];
            App.ui.renderSuggestions(suggestions);
        },

        async handleCommanderUpdate(nameOverride = null) {
            const name = nameOverride || this.elements.commanderNameInput.value.trim();
            if (name === this.state.commanderName && nameOverride === null) return; // No change unless forced

            this.state.commanderName = name;
            App.elements.commanderNameInput.value = name; // Ensure input reflects selected name
            if (!name) {
                this.state.commanderImageUrl = null;
                this.state.edhrecRank = null; // Reset edhrecRank
                this.ui.renderCommanderImage();
                this.stateManager.saveState();
                return;
            }

            const card = await this.scryfall.fetchCard(name);
            this.state.commanderImageUrl = card?.image_uris?.art_crop || null;
            this.state.edhrecRank = card?.edhrec_rank || null; // Store edhrec_rank
            this.ui.renderCommanderImage();
            this.stateManager.saveState();
        },
        
        handleUrlParams() {
            const params = new URLSearchParams(window.location.search);
            if (params.has('answers')) {
                try {
                    const answersJson = atob(params.get('answers'));
                    const answers = JSON.parse(answersJson);
                    this.stateManager.setState(answers);
                    this.elements.resultsSection.classList.remove('hidden');
                    this.elements.resultsSection.scrollIntoView({ behavior: 'smooth' });
                } catch(e) {
                    console.error("Failed to parse answers from URL", e);
                    alert("Could not load shared answers. The link may be corrupted.");
                }
            }
        },

        // --- MODULES ---

        // Config loading and parsing
        config: {
            async load() {
                const response = await fetch('config.toml');
                if (!response.ok) {
                    throw new Error(`Failed to fetch config.toml: ${response.statusText}`);
                }
                const tomlString = await response.text();
                const parsed = TOML.parse(tomlString);

                // Basic validation
                if (!parsed || !Array.isArray(parsed.questions)) {
                    console.error('Parsed config missing required `questions` array:', parsed);
                    throw new Error('Invalid configuration: missing questions.');
                }

                // Normalize question objects to work around parser limitations
                parsed.questions = parsed.questions.map(q => {
                    // Ensure nested scoring object exists and move dotted keys into it
                    q.scoring = q.scoring || {};
                    Object.keys(q).forEach(k => {
                        if (k.startsWith('scoring.') && k.length > 8) {
                            q.scoring[k.slice(8)] = q[k];
                            delete q[k];
                        }
                    });

                    // If options were parsed as inline-table strings (e.g. "{ label = \"2 cards\", value = 6 }")
                    // attempt to extract label/value pairs so UI can render them.
                    if (q.scoring && Array.isArray(q.scoring.options)) {
                        q.scoring.options = q.scoring.options.map(opt => {
                            // Ensure opt is not null or undefined
                            if (opt === null || typeof opt === 'undefined') {
                                console.warn(`Skipping null/undefined option for question ${q.id}:`, opt);
                                return null;
                            }

                            // If opt is a string, attempt to parse it
                            if (typeof opt === 'string' && opt.trim().startsWith('{')) {
                                const labelMatch = opt.match(/label\s*=\s*"([^"]+)"/);
                                const valueMatch = opt.match(/value\s*=\s*([0-9.-]+)/); // Allow negative values and decimals
                                if (labelMatch && valueMatch) {
                                    return {
                                        label: labelMatch[1],
                                        value: parseFloat(valueMatch[1])
                                    };
                                } else {
                                    console.warn(`Failed to parse string option for question ${q.id}:`, opt);
                                    return null; // Return null for malformed string options
                                }
                            }
                            // If opt is already an object, validate its structure
                            else if (typeof opt === 'object' && opt !== null && 'label' in opt && 'value' in opt) {
                                // Ensure value is a number
                                if (typeof opt.value === 'string') {
                                    opt.value = parseFloat(opt.value);
                                }
                                return opt;
                            } else {
                                console.warn(`Skipping malformed option for question ${q.id}:`, opt);
                                return null; // Return null for any other malformed options
                            }
                        }).filter(opt => opt !== null); // Filter out any nulls resulting from parsing failures
                    }

                    return q;
                });

                App.state.config = parsed;
                console.log('Parsed and normalized config:', App.state.config);
            },
        },

        // UI Rendering
        ui: {
            renderGlobalContent() {
                const cfg = App.state.config || {};
                App.elements.mainTitle.textContent = cfg.title || 'Questionnaire';
                App.elements.mainSubtitle.textContent = cfg.subtitle || '';
            },

            renderQuestions() {
                if (!App.state.config || !Array.isArray(App.state.config.questions)) {
                    console.error('No questions available to render. Current config:', App.state.config);
                    App.elements.form.innerHTML = '<p class="error">Configuration error: no questions found. Check console for details.</p>';
                    return;
                }

                const questionsHtml = App.state.config.questions.map(q => {
                    switch (q.type) {
                        case 'toggle': return this.renderToggle(q);
                        case 'count': return this.renderCount(q);
                        case 'multiple': return this.renderMultiple(q);
                        default: return '';
                    }
                }).join('');
                App.elements.form.innerHTML = questionsHtml;
                
                // Add event listeners for count buttons
                App.elements.form.querySelectorAll('.count-btn').forEach(button => {
                    button.addEventListener('click', () => {
                        const input = button.parentElement.querySelector('input');
                        const oldValue = parseInt(input.value, 10) || 0;
                        const delta = button.dataset.delta === '+' ? 1 : -1;
                        const cap = parseInt(input.max, 10);
                        let newValue = oldValue + delta;

                        if (newValue < 0) newValue = 0;
                        if (!isNaN(cap) && newValue > cap) newValue = cap;
                        
                        input.value = newValue;
                        // Manually trigger input event
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    });
                });
            },

            renderToggle(q) {
                return `
                    <div class="question-card">
                        <label class="question-prompt" for="${q.id}">${q.prompt}</label>
                        <p class="question-description">${q.description || ''}</p>
                        <div class="input-wrapper">
                             <label class="switch">
                                <input type="checkbox" id="${q.id}" name="${q.id}">
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>
                `;
            },

            renderCount(q) {
                const maxAttr = q.scoring.cap ? `max="${q.scoring.cap}"` : '';
                return `
                    <div class="question-card">
                        <label class="question-prompt" for="${q.id}">${q.prompt}</label>
                        <p class="question-description">${q.description || ''}</p>
                        <div class="input-wrapper">
                            <div class="count-input">
                                <button type="button" class="count-btn" data-delta="-">-</button>
                                <input type="number" id="${q.id}" name="${q.id}" value="0" min="0" ${maxAttr} pattern="[0-9]*">
                                <button type="button" class="count-btn" data-delta="+">+</button>
                            </div>
                        </div>
                    </div>
                `;
            },

            renderMultiple(q) {
                const optionsHtml = q.scoring.options.map((opt, index) => `
                    <div class="multiple-choice-option">
                        <input type="radio" id="${q.id}-${index}" name="${q.id}" value="${opt.value}" ${index === q.scoring.options.length - 1 ? 'checked' : ''}>
                        <label for="${q.id}-${index}">${opt.label}</label>
                    </div>
                `).join('');
                return `
                    <div class="question-card">
                        <fieldset>
                            <legend class="question-prompt">${q.prompt}</legend>
                            <p class="question-description">${q.description || ''}</p>
                            ${optionsHtml}
                        </fieldset>
                    </div>
                `;
            },

            renderSuggestions(suggestions) {
                App.elements.autocompleteSuggestions.innerHTML = '';
                if (suggestions && suggestions.length > 0) {
                    suggestions.forEach(suggestion => {
                        const div = document.createElement('div');
                        div.classList.add('suggestion-item');
                        div.textContent = suggestion;
                        App.elements.autocompleteSuggestions.appendChild(div);
                    });
                    App.elements.autocompleteSuggestions.classList.remove('hidden');
                } else {
                    App.elements.autocompleteSuggestions.classList.add('hidden');
                }
            },

            clearSuggestions() {
                App.elements.autocompleteSuggestions.innerHTML = '';
                App.elements.autocompleteSuggestions.classList.add('hidden');
            },

            renderCommanderImage() {
                if (App.state.commanderImageUrl) {
                    App.elements.commanderImage.src = App.state.commanderImageUrl;
                    App.elements.commanderImage.alt = App.state.commanderName;
                    App.elements.commanderImageContainer.classList.remove('hidden');
                } else {
                    App.elements.commanderImage.src = '';
                    App.elements.commanderImage.alt = 'Commander Image';
                    App.elements.commanderImageContainer.classList.add('hidden');
                }
            },
            
            renderResults(score, tier, breakdown, categoryTotals) {
                App.ui.renderCommanderImage();
                App.elements.totalScore.textContent = score.toFixed(1);
                App.elements.tierLabel.textContent = tier.label;
                App.elements.tierLabel.style.backgroundColor = tier.color;

                const breakdownHtml = `
                    <table>
                        <tr><th>Question</th><th>Score</th></tr>
                        ${breakdown.map(item => `<tr><td>${item.name}</td><td>${item.score.toFixed(1)}</td></tr>`).join('')}
                        <tr class="category-total"><td>---</td><td></td></tr>
                        ${Object.entries(categoryTotals).map(([key, value]) => `
                            <tr class="category-total">
                                <td>${App.state.config.categories.find(c => c.tag === key).label} Total</td>
                                <td>${value.toFixed(1)}</td>
                            </tr>`).join('')}
                    </table>
                `;
                App.elements.resultsBreakdown.innerHTML = breakdownHtml;
                
                const getQualitativeLevel = (tag, total) => {
                    const thresholds = {
                        // Negative scoring
                        hateable: { low: -1, medium: -3, high: -5 },
                        jank: { low: -1, medium: -3, high: -6 },
                        telegraphed: { low: -1, medium: -3, high: -5 },
                        // Positive scoring
                        stax: { low: 1, medium: 4, high: 6 },
                        resilience: { low: 1, medium: 3, high: 5 },
                        combos: { low: 1, medium: 4, high: 7 },
                        extra_turns: { low: 1, medium: 4, high: 7 },
                    };
                    const th = thresholds[tag];
                    if (!th) return null;

                    if (total === 0) return 'None';
                    if (th.low < 0) { // Inverted scale for negative scores
                        if (total <= th.high) return 'High';
                        if (total <= th.medium) return 'Medium';
                        if (total <= th.low) return 'Low';
                        return 'None';
                    } else {
                        if (total >= th.high) return 'High';
                        if (total >= th.medium) return 'Medium';
                        if (total >= th.low) return 'Low';
                        return 'None';
                    }
                };

                const wrappedHtml = App.state.config.categories
                    .sort((a,b) => (categoryTotals[b.tag] || 0) - (categoryTotals[a.tag] || 0))
                    .reduce((html, cat) => {
                        let displayValue = '';
                        const total = categoryTotals[cat.tag];
                        const qualitativeCategories = ['hateable', 'jank', 'stax', 'resilience', 'combos', 'extra_turns', 'telegraphed'];
                        
                        if (qualitativeCategories.includes(cat.tag)) {
                            displayValue = getQualitativeLevel(cat.tag, total);
                        } else {
                            // Logic for count-based categories that don't need qualitative labels
                            const associatedQuestions = App.state.config.questions.filter(q => q.tags && q.tags.includes(cat.tag));
                             if (associatedQuestions.length > 0) {
                                const answer = App.state.answers[associatedQuestions[0].id];
                                if (answer) displayValue = answer.toString();
                            }
                        }

                        if (displayValue) {
                            html += `
                                <div class="category-card">
                                    <div class="icon">${cat.icon}</div>
                                    <div class="label">${cat.label}</div>
                                    <div class="value">${displayValue}</div>
                                </div>
                            `;
                        }
                        return html;
                    }, '');
                App.elements.wrappedCategories.innerHTML = wrappedHtml || '<p>No specific categories to highlight based on your answers.</p>';

            }
        },

        // State Management (answers, localStorage, URL sharing)
        stateManager: {
            updateAnswer(id, value, type) {
                if (type === 'checkbox') {
                    App.state.answers[id] = document.getElementById(id).checked;
                } else if(type === 'number') {
                    App.state.answers[id] = parseInt(value, 10) || 0;
                } else {
                    App.state.answers[id] = value;
                }
                this.saveState();
            },
            
            setState(newState) {
                // Set Commander Info
                App.state.commanderName = newState.commanderName || '';
                App.state.commanderImageUrl = newState.commanderImageUrl || null;
                App.state.edhrecRank = newState.edhrecRank || null;
                App.elements.commanderNameInput.value = App.state.commanderName;
                App.ui.renderCommanderImage();

                // Set Answers
                App.state.answers = newState.answers || {};
                App.state.config.questions.forEach(q => {
                    const input = App.elements.form.elements[q.id];
                    const answer = App.state.answers[q.id];
                    if (input === undefined || answer === undefined) return;
                    
                    if (q.type === 'toggle') {
                        input.checked = answer;
                    } else if (q.type === 'multiple') {
                        // For radio buttons
                        const radioInput = Array.from(input).find(i => i.value == answer);
                        if(radioInput) radioInput.checked = true;
                    } else {
                        input.value = answer;
                    }
                });
                this.saveState();
                App.scoring.calculateAndDisplay();
            },

            saveState() {
                const stateToSave = {
                    answers: App.state.answers,
                    commanderName: App.state.commanderName,
                    commanderImageUrl: App.state.commanderImageUrl,
                    edhrecRank: App.state.edhrecRank,
                };
                localStorage.setItem('deckStrengthState', JSON.stringify(stateToSave));
            },

            loadState() {
                const saved = localStorage.getItem('deckStrengthState');
                if (saved) {
                    const loadedState = JSON.parse(saved);
                    // Ensure edhrecRank is loaded if present
                    if (loadedState.edhrecRank !== undefined) {
                        App.state.edhrecRank = loadedState.edhrecRank;
                    }
                    this.setState(loadedState);
                }
            },
            
            reset() {
                 if(confirm('Are you sure you want to reset all your answers and commander?')) {
                    localStorage.removeItem('deckStrengthState');
                    
                    // Reset state object
                    App.state.answers = {};
                    App.state.commanderName = '';
                    App.state.commanderImageUrl = null;
                    App.state.edhrecRank = null; // Reset edhrecRank
                    
                    // Reset UI
                    App.elements.commanderNameInput.value = '';
                    App.ui.renderCommanderImage();
                    App.elements.form.reset();
                    
                    // Manually reset count inputs and re-check default radios
                     App.state.config.questions.forEach(q => {
                        if (q.type === 'count') {
                            App.elements.form.elements[q.id].value = 0;
                        } else if (q.type === 'multiple') {
                            const lastOption = q.scoring.options.length - 1;
                            App.elements.form.elements[`${q.id}-${lastOption}`].checked = true;
                        }
                    });
                    
                    App.scoring.calculateAndDisplay();
                    App.elements.resultsSection.classList.add('hidden');
                }
            },
            
            share() {
                const stateToShare = {
                    answers: App.state.answers,
                    commanderName: App.state.commanderName,
                    commanderImageUrl: App.state.commanderImageUrl,
                    edhrecRank: App.state.edhrecRank,
                };
                const jsonString = JSON.stringify(stateToShare);
                const base64String = btoa(jsonString);
                const url = new URL(window.location);
                url.searchParams.set('answers', base64String);
                
                navigator.clipboard.writeText(url.toString()).then(() => {
                    alert('Sharable link copied to clipboard!');
                }, () => {
                    alert('Failed to copy link. Please copy it from your address bar.');
                });
            }
        },

        // Scoring Logic
        scoring: {
            calculateAndDisplay() {
                if (!App.state.config) {
                    console.warn('Cannot calculate score: config not loaded.');
                    return;
                }

                const breakdown = [];
                const categoryTotals = (App.state.config.categories || []).reduce((acc, cat) => ({...acc, [cat.tag]: 0}), {});

                let totalScore = 0;

                // Add commander EDHREC Rank contribution
                let edhrecScoreContribution = 0;
                if (App.state.edhrecRank) {
                    const rank = App.state.edhrecRank;
                    // Formula: score_contribution = 1248.75 / (rank + 248.75)
                    edhrecScoreContribution = 1248.75 / (rank + 248.75);
                    totalScore += edhrecScoreContribution;
                    breakdown.push({ name: `Commander EDHREC Rank (${rank})`, score: edhrecScoreContribution });
                }

                App.state.config.questions.forEach(q => {
                    const answer = App.state.answers[q.id];
                    let questionScore = 0;

                    if (answer !== undefined) {
                        switch (q.type) {
                            case 'toggle':
                                questionScore = answer ? parseFloat(q.scoring.weight) : 0;
                                break;
                            case 'count':
                                const val = Math.min(answer, q.scoring.cap || Infinity);
                                questionScore = val * parseFloat(q.scoring.weight_per);
                                break;
                            case 'multiple':
                                questionScore = parseFloat(answer);
                                break;
                        }
                    } else if (q.type === 'multiple') {
                        // Default value for multiple choice
                        questionScore = parseFloat(q.scoring.options[q.scoring.options.length - 1].value);
                    }
                    
                    totalScore += questionScore;
                    breakdown.push({ name: q.name, score: questionScore });

                    if (q.tags) {
                        q.tags.forEach(tag => {
                            if (categoryTotals[tag] !== undefined) {
                                categoryTotals[tag] += questionScore;
                            }
                        });
                    }
                });
                
                const tier = this.getTier(totalScore);
                App.ui.renderResults(totalScore, tier, breakdown, categoryTotals);
            },
            
            getTier(score) {
                let currentTier = App.state.config.tiers[0];
                for (const tier of App.state.config.tiers) {
                    if (score >= tier.minScore) {
                        currentTier = tier;
                    } else {
                        break;
                    }
                }
                return currentTier;
            },
        },

        // Scryfall API handler
        scryfall: {
            async fetchCard(name) {
                if (!name) return null;
                try {
                    const response = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`);
                    if (!response.ok) {
                        if (response.status === 404) {
                            console.warn(`Card not found on Scryfall: ${name}`);
                            return null;
                        }
                        throw new Error(`Scryfall API error: ${response.statusText}`);
                    }
                    const card = await response.json();
                    return card;
                } catch (error) {
                    console.error('Failed to fetch from Scryfall:', error);
                    return null;
                }
            },

            async fetchAutocompleteSuggestions(query) {
                if (!query || query.length < 2) return []; // Scryfall autocomplete typically needs at least 2 chars
                try {
                    const response = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(query)}`);
                    if (!response.ok) {
                        console.warn(`Scryfall autocomplete API error: ${response.statusText}`);
                        return [];
                    }
                    const data = await response.json();
                    return data.data || []; // 'data' field contains the array of suggestions
                } catch (error) {
                    console.error('Failed to fetch autocomplete suggestions from Scryfall:', error);
                    return [];
                }
            },
        },
    };

    App.init();
});
