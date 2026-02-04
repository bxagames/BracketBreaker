document.addEventListener('DOMContentLoaded', () => {
    const App = {
        // DOM Elements
        elements: {
            mainTitle: document.getElementById('main-title'),
            mainSubtitle: document.getElementById('main-subtitle'),
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
        },

        // Initialization
        async init() {
            try {
                await this.config.load();
                this.ui.renderGlobalContent();
                this.ui.renderQuestions();
                this.stateManager.loadAnswers();
                this.addEventListeners();
                this.handleUrlParams();
            } catch (error) {
                console.error('Initialization failed:', error);
                alert('Failed to load the questionnaire. Please check the console for errors.');
            }
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
        },
        
        handleUrlParams() {
            const params = new URLSearchParams(window.location.search);
            if (params.has('answers')) {
                try {
                    const answersJson = atob(params.get('answers'));
                    const answers = JSON.parse(answersJson);
                    this.stateManager.setAnswers(answers);
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
                            if (typeof opt === 'string' && opt.trim().startsWith('{')) {
                                const labelMatch = opt.match(/label\s*=\s*"([^"]+)"/);
                                const valueMatch = opt.match(/value\s*=\s*([0-9.]+)/);
                                return {
                                    label: labelMatch ? labelMatch[1] : opt,
                                    value: valueMatch ? parseFloat(valueMatch[1]) : opt
                                };
                            }
                            return opt;
                        });
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
            
            renderResults(score, tier, breakdown, categoryTotals) {
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

                const wrappedHtml = App.state.config.categories.filter(cat => categoryTotals[cat.tag] > 0)
                    .sort((a,b) => categoryTotals[b.tag] - categoryTotals[a.tag])
                    .map(cat => `
                    <div class="category-card">
                        <div class="icon">${cat.icon}</div>
                        <div class="label">${cat.label}</div>
                        <div class="value">${categoryTotals[cat.tag].toFixed(1)}</div>
                    </div>
                `).join('');
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
                this.saveAnswers();
            },
            
            setAnswers(newAnswers) {
                App.state.answers = newAnswers;
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
                this.saveAnswers();
                App.scoring.calculateAndDisplay();
            },

            saveAnswers() {
                localStorage.setItem('deckAnswers', JSON.stringify(App.state.answers));
            },

            loadAnswers() {
                const saved = localStorage.getItem('deckAnswers');
                if (saved) {
                    this.setAnswers(JSON.parse(saved));
                }
            },
            
            reset() {
                 if(confirm('Are you sure you want to reset all your answers?')) {
                    localStorage.removeItem('deckAnswers');
                    App.state.answers = {};
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
                const jsonString = JSON.stringify(App.state.answers);
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
    };

    App.init();
});
