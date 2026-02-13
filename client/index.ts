import './styles.css'; // We will populate this file in next sub-chapter

import {Card, Color,Cell, COLORS, Game, GameState, RANKS, Rank, isDragon, isLotus} from './interface'
import {Solver} from './Solver'

declare global {
    interface Window { game: Game;}
}

class GameImpl implements Game {
    gameState?: GameState;
    solver?: Solver;
    constructor() {
        if (window.game) {
            return;
        }
        window.game = this;
        this.gameState = GameImpl.createInitialGameState()
        GameImpl.renderGameState(this.gameState);
        this.solver = new Solver((gameState: GameState) => {
            this.gameState = gameState;
            GameImpl.renderGameState(this.gameState);
        });


        window.setTimeout(() => {
            if (this.solver && this.gameState)
                this.solver.solveFrom(this.gameState);
        })
    }


    static createDeck(): Card[] {
        let deck = [];
        for (const color of COLORS) {
            for (const rank of RANKS) {
                // console.log(rank,rankVal)
                deck.push({color, rank})
            }
            for(let i = 0; i < 4; i++) {
                deck.push({color, isDragon: true, locked: false})
            }
        }
        deck.push({isLotus: true, locked: false})

       
        let currentIndex = deck.length;

        // While there remain elements to shuffle...
        while (currentIndex != 0) {

            // Pick a remaining element...
            let randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;

            // And swap it with the current element.
            [deck[currentIndex], deck[randomIndex]] = [
            deck[randomIndex], deck[currentIndex]];
        }

        return deck;

    }

    static createInitialGameState(): GameState {
        
        const deck = GameImpl.createDeck();
        console.log(deck);
        const gameCells: [Cell, Cell, Cell, Cell, Cell, Cell, Cell, Cell] = [[],[],[],[],[],[],[],[]]
        const freeCards: [Card|null,Card|null,Card|null] = [null,null,null];

        let curIndex = 0;

        while (deck.length) {
            const nextCard = deck.pop()
            if (nextCard === undefined) break;
            gameCells[curIndex].push(nextCard)

            curIndex = (curIndex+1) % gameCells.length;
        }
        
        const state = {
            freeCards,
            lotusCell: null,
            redStack: 0,
            greenStack: 0,
            blackStack: 0,
            gameCells,
        }
        
        
        return state;
    }

    static renderGameState(state: GameState) {
        const canvas = document.getElementById("c") as HTMLCanvasElement;
        const size = {w: 16*70, h: 16*50}
        canvas.width = size.w
        canvas.height = size.h
        
        if(!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = 'darkgreen';
        ctx.strokeStyle = 'black';

        ctx.fillRect(0,0,size.w,size.h)

        const settings = {
            sideMargin: size.w*0.1,
            contentWidth: size.w * 0.8,

            cardWidth: size.w * 0.08,
            cardMargin: size.w * 0.01,

            topMargin: size.h * 0.1,
            bottomMargin: size.h * 0.4,

            cardHeight: size.h * 0.2,

            rowGutter: size.h * 0.1,

            textOffset: {w: size.w*0.004, h: size.h * 0.026},

            depthHeightOffset: size.h * 0.033
        }

        ctx.fillStyle = 'white';

        const drawCard = (card: Card, depth: number, xStart: number, yStart: number) => {
            yStart += depth * settings.depthHeightOffset

            ctx.fillStyle = "white"
            ctx.strokeStyle = "black"
            ctx.beginPath();
            ctx.roundRect(xStart, yStart, settings.cardWidth, settings.cardHeight, 5)
            ctx.closePath();
            ctx.fill()
            ctx.stroke();
            ctx.fillStyle = "black";
           
            const drawText = (text: string) => {
                ctx.font = "16px Verdana"
                const textSize = ctx.measureText(text);
                ctx.fillText(text, xStart + settings.textOffset.w, yStart + settings.textOffset.h)
                const textHeight = textSize.fontBoundingBoxAscent + textSize.fontBoundingBoxDescent;
                ctx.fillText(text, xStart + settings.cardWidth - settings.textOffset.w - textSize.width, yStart + settings.cardHeight - settings.textOffset.h + textHeight/2)
            }

            if (isDragon(card)) {
                if (card.color == 'RED') {
                    drawText('👹')

                } else if (card.color == 'GREEN') {
                    drawText('🐉')

                } else {
                    drawText('🀄')
                }
               
                
            }
            else if (isLotus(card)) {
                drawText('🪷')
            }
            else { // Number
                ctx.fillStyle = card.color;
                drawText(card.rank ?? '_')
            }
        }

        const drawCell = (cell: Cell|undefined, col: number, row: number) => {
            const xStart = settings.sideMargin + col * (settings.cardWidth + settings.cardMargin);
            const yStart = settings.topMargin + row*settings.cardHeight + row * settings.rowGutter;

            if (cell) {
                for(let c = 0; c < cell.length; c++) {
                    drawCard(cell[c], c, xStart, yStart)
                }
                
            }
            else {
                ctx.strokeRect(xStart, yStart, settings.cardWidth, settings.cardHeight);
            }
            
        }

        for(let i = 0; i < state.freeCards.length; i++) {
            const card = state.freeCards[i];
            drawCell(card ? [card] : undefined, i, 0);
        }

        drawCell(state.lotusCell ? [state.lotusCell] : undefined, 3.5, 0);

        drawCell(state.redStack > 0 ? [{color: 'RED', rank: `${state.redStack}`}] : undefined, 5, 0);
        drawCell(state.greenStack > 0 ? [{color: 'GREEN', rank: `${state.greenStack}`}] : undefined, 6, 0);
        drawCell(state.blackStack > 0 ? [{color: 'BLACK', rank: `${state.blackStack}`}] : undefined, 7, 0);
        

        for(let i = 0; i < state.gameCells.length; i++) {   
            const stack = state.gameCells[i];
            drawCell(stack.length ? stack : undefined, i, 1);

        }

    }
}

new GameImpl();

(window as any).renderGameState = GameImpl.renderGameState