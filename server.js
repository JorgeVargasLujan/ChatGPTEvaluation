require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { Configuration, OpenAIApi } = require('openai');
const path = require('path');

const app = express();
app.use(express.json());

// MongoDB Connection
const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ChatGPT_Evaluation';
mongoose
    .connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('Connected to MongoDB successfully'))
    .catch((err) => console.error('MongoDB connection error:', err));

// MongoDB Schemas
const historySchema = new mongoose.Schema({
    question: String,
    option1: String,
    option2: String,
    option3: String,
    option4: String,
    answer: String,
});
const socialScienceSchema = new mongoose.Schema(historySchema);
const computerSecuritySchema = new mongoose.Schema(historySchema);

const History = mongoose.model('History', historySchema);
const SocialScience = mongoose.model('Social_Science', socialScienceSchema);
const ComputerSecurity = mongoose.model('Computer_Security', computerSecuritySchema);

// OpenAI API Configuration
const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Serve Static Files
app.use(express.static(path.join(__dirname, 'public')));

// Fetch a Random Question from the Database
app.get('/api/random-question/:collection', async (req, res) => {
    const { collection } = req.params;

    let Model;
    if (collection === 'History') Model = History;
    else if (collection === 'Social_Science') Model = SocialScience;
    else if (collection === 'Computer_Security') Model = ComputerSecurity;
    else return res.status(400).json({ error: 'Invalid collection name' });

    try {
        const count = await Model.countDocuments();
        if (count === 0) {
            return res.status(404).json({ error: `No questions available in the ${collection} collection.` });
        }

        const random = Math.floor(Math.random() * count);
        const randomQuestion = await Model.findOne().skip(random);

        res.status(200).json(randomQuestion);
    } catch (error) {
        console.error(`Error fetching random question from ${collection}:`, error.message);
        res.status(500).json({ error: `Error fetching random question: ${error.message}` });
    }
});

// Post a Question to ChatGPT
app.post('/api/chatgpt', async (req, res) => {
    const { question } = req.body;

    if (!question) {
        return res.status(400).json({ error: 'Question is required' });
    }

    try {
        const response = await openai.createChatCompletion({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: 'Provide a simple answer to the following question.' },
                { role: 'user', content: question },
            ],
            max_tokens: 50,
            temperature: 0.3,
        });

        const chatGPTAnswer = response.data.choices[0]?.message?.content.trim();
        res.status(200).json({ answer: chatGPTAnswer });
    } catch (error) {
        console.error('Error communicating with ChatGPT:', error.message);
        res.status(500).json({ error: `Error communicating with ChatGPT: ${error.message}` });
    }
});

// Compare Answers Using ChatGPT
app.post('/api/compare-answers', async (req, res) => {
    const { question, databaseAnswer, chatGPTAnswer } = req.body;

    if (!question || !databaseAnswer || !chatGPTAnswer) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const prompt = `
    You are an evaluator comparing answers to a question. 
    Question: ${question}
    Answer A (Database): ${databaseAnswer}
    Answer B (ChatGPT): ${chatGPTAnswer}
    
    Which answer better addresses the question? Provide a clear explanation and indicate the chosen answer as either "Answer A" or "Answer B".
    Include if it's the database or ChatGPT.
    `;

    try {
        const response = await openai.createChatCompletion({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'system', content: 'Act as an impartial evaluator.' },
                { role: 'user', content: prompt },
            ],
            max_tokens: 50,
            temperature: 0,
        });

        const evaluation = response.data.choices[0]?.message?.content.trim();
        res.status(200).json({ evaluation });
    } catch (error) {
        console.error('Error evaluating answers:', error.message);
        res.status(500).json({ error: 'Unable to evaluate answers' });
    }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));
