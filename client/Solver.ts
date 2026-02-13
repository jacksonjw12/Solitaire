import {Card, Color,Cell, COLORS, cardEquals, Game, GameState, NumberCard, isNumber, RANKS, Rank, isDragon, isLotus, WIN_STATE, Lockable} from './interface'
import stableStringify from 'json-stable-stringify';

const scores = {
    emptyGameCell: 1.0,
    emptyFreeSlot: 0.5,
    fullySortedCell: 1.0
}

// Must be stable to detect cycles, depth can't go in here.
export interface Move {
    gameState: GameState
    description?: string
    isWin?: boolean
    hash: string // hash of gamestate
    moveType: MoveType
}

/**
 * Roughly in order of expected priority
 */
export enum MoveType {
    Initial,
    LotusCollection,
    DragonCollection,
    NumberCollection,
    FreeSlotToCell,
    CellToCell,
    CellToFreeSlot,
}

const moveOrder = [
    MoveType.LotusCollection, 
    MoveType.DragonCollection,
    MoveType.NumberCollection,
    MoveType.FreeSlotToCell,
    MoveType.CellToCell,
    MoveType.CellToFreeSlot]


export type Solution = Move[]

const quickCopyState = (gameState: GameState): GameState => {
    return JSON.parse(JSON.stringify(gameState)) as GameState;
}

const generateAltColors = (color: Color): Color[] => {
    switch(color) {
        case "RED":
            return ["GREEN", "BLACK"]
        case "GREEN":
            return ["RED", "BLACK"]
        case "BLACK":
            return ["RED", "GREEN"]
        default:
            throw new Error("what color??")
    }
}
const getStackFromColor = (gameState: GameState, color: Color) => {
    switch(color) {
        case "RED":
            return gameState.redStack
        case "GREEN":
            return gameState.greenStack
        case "BLACK":
            return gameState.blackStack
        
        default:
            throw new Error("what color??")
    }
}

const getAltStacksFromColor = (gameState: GameState, color: Color) => {
    switch(color) {
        case "RED":
            return [gameState.greenStack, gameState.blackStack]
        case "GREEN":
            return [gameState.redStack, gameState.blackStack]
        case "BLACK":
            return [gameState.redStack, gameState.greenStack]
        
        default:
            throw new Error("what color??")
    }
}
const canMoveAOntoB = (a: NumberCard, b?: Card): boolean => {
    if (b === undefined) {
        return true;
    }
    if (!isNumber(b) || a.color === b.color) {
        return false;
    }
    return Number(a.rank) + 1 === Number(b.rank);
}


async function waitAtLeast(timeoutMs: number) {
    return new Promise(res => setTimeout(res, timeoutMs));
}

interface GameScore {
    freeCells: number
    freeCards : number
    cardsInPlay: number
    aggregateFree: number
    foldedDragons: number
}

const freeCardMult = 0.6;
const freeCellMult = 1.0;

const score = (gameState: GameState): GameScore => {
    let freeCells = 0;
    let cardsInPlay = 0;
    let freeCards = 0;
    let foldedDragons = 0;
    let goodStacks = 0;
    if (gameState.lotusCell) {
        foldedDragons++;
    }
    for(const freeCard of gameState.freeCards) {
        if (freeCard) {
            cardsInPlay++;
            if (isDragon(freeCard) && freeCard.locked) {
                foldedDragons++;
            }
        }
        else {
            freeCards++;
        }
        
    }
    for(const gameCell of gameState.gameCells) {
        cardsInPlay += gameCell.length;
        if (!gameCell.length) {
            freeCells++;
        }
        // if (gameCell.length === 1 && freeCards) {
        //     freeCards--;
        //     freeCells++;
        // }

        // let isGoodStack = true;
        // for(let g = 0; g < gameCell.length; g++) {
            
        // }

    }
   

    return {
        aggregateFree : freeCards * freeCardMult + freeCells * freeCellMult,
        freeCells,
        freeCards,
        cardsInPlay,
        foldedDragons
    };

}

interface Comparison {
    strict: number
    loose: number
}

// positive if A better than B
// negative if A worse than B
// 0 if not able to tell
const compare = (gameStateA: GameState, gameStateB: GameState): Comparison => {
   // we should see if we are in a new global better position, 
   // if so 
   const scoreA = score(gameStateA);
   const scoreB = score(gameStateB);

//    if (scoreA.aggregateFree == scoreB.aggregateFree) {
//     return scoreA.freeCards - scoreB.freeCards;
//    }

    let strict = scoreA.freeCells + scoreA.freeCards - scoreB.freeCells - scoreB.freeCards;
    // if (strict === 0) {
    //     strict = scoreA.freeCells - scoreB.freeCells
    // }
    let loose = strict;
    if(strict == 0) {
        loose = scoreA.aggregateFree - scoreB.aggregateFree
        if (loose == 0) {
            loose = scoreA.cardsInPlay - scoreB.cardsInPlay
        }
    }

   return {
    strict,
    loose
    
    };

   
}



export class Solver {
    static winHash = Solver.getStateHash(WIN_STATE)

    static getStateHash(gameState: GameState): string {
        const s = stableStringify(gameState)
        if (s === undefined) {
            throw new Error(`Stable stringify was not able to handle gameState: ${JSON.stringify(gameState)}`);
        }
        return s;
    }

    // undefined/false -- unvisited
    // true -- visited
    visitedMap = new Map<string, boolean>();
    parentMap = new Map<string, {parentMove: Move, parentDepth: number}>();
    renderCb: (gameState: GameState) => void
    constructor(renderCb: (gameState: GameState) => void) {
        this.renderCb = renderCb;
    }

    constructSolution(node: Move): Solution {
        let path = [node];
        let atOrigin = false;
        let maxDepth = 10;
        let depth = 0;
        while(!atOrigin && depth < maxDepth ) {
            const parent = this.parentMap.get(path[path.length-1].hash);
            if (parent) {
                console.log(parent, path)
                path.push(parent.parentMove);
            }
            else {
                atOrigin = true;
            }
            depth++;
        }
        return path.reverse();
    }

   
    async solveFrom(gameState: GameState): Promise<Solution | false> {
        console.log("solving");

        const fullyExplore = false;

        let localMax = 0;

        let stack: Solution = [{moveType: MoveType.Initial,gameState, hash: Solver.getStateHash(gameState)}];
        while (stack.length) {
            const node = stack.pop();
            if (!node) {
                throw new Error("node was empty");
            }
            const {gameState, hash, isWin} = node;
            
            if (this.visitedMap.has(hash)) {
                continue;
            }
            //console.log("move was unseen", node)
            this.visitedMap.set(hash, true);

            if (isWin) {
                console.log("got a win", node);
                (window as any).parentMap = this.parentMap;
                if (!fullyExplore) {
                    return this.constructSolution(node);
                }
            }
            
            const myParent = this.parentMap.get(hash) ?? {parentHash: "origin", parentDepth: -1};
            const myDepth = myParent.parentDepth + 1;

            let {moves, freeMoves} = this.getAllMovesFrom(gameState);
            await waitAtLeast(0);

            while (freeMoves.length) {
                const freeMove = freeMoves[0];
                const parentMap = this.parentMap.get(freeMove.hash);
                if (parentMap === undefined || (parentMap && parentMap.parentDepth > myDepth)) {
                    // Found a closer way or initial way to get to this move.
                    this.parentMap.set(freeMove.hash, {parentMove: node, parentDepth: myDepth})
                }

                ({moves, freeMoves} = this.getAllMovesFrom(freeMoves[0].gameState))
                
            }

            if(freeMoves.length) {

                const freeMove = freeMoves[0];
                const parentMap = this.parentMap.get(freeMove.hash);
                if (parentMap === undefined || (parentMap && parentMap.parentDepth > myDepth)) {
                    // Found a closer way or initial way to get to this move.
                    this.parentMap.set(freeMove.hash, {parentMove: node, parentDepth: myDepth})
                }
                if (!this.visitedMap.has(freeMove.hash)) {
                    stack.push(freeMove);
                }
            } else {

                // First we should check if we are in a new global "better" position than the previous state
                // If so we should prune the tree and re-begin the serach

                for (const move of moves) {
                    const comp = compare(move.gameState, gameState)
                    
                    
                    
                    const parentMap = this.parentMap.get(move.hash);
                    if (parentMap === undefined || (parentMap && parentMap.parentDepth > myDepth)) {
                        // Found a closer way or initial way to get to this move.
                        this.parentMap.set(move.hash, {parentMove: node, parentDepth: myDepth})
                    }
                    
                    if (!this.visitedMap.has(move.hash)) {
                        if(comp.loose > localMax) {
                        localMax = comp.loose;
                        console.log("found new local max: ", move)
                        //this.renderCb(move.gameState);
                        //await waitAtLeast(100);
                    }
                    if (comp.strict > 0.1) {
                        console.log("found new best state: ", move);
                        this.renderCb(move.gameState);
                        console.log("solution: ", this.constructSolution(move))
                        await waitAtLeast(100);
                        //stack = [];
                        //break;
                        
                    }
                        stack.push(move)
                    }
                }
            }
            
        
            


        }
        console.log("exhausted search");
        return false;

    }


    getLotusCollection(grabs: Cell[], gameState: GameState): Move[] {
        for(const [cellIndex, cellGrab] of grabs.entries()) {
            if (cellGrab.length !== 1) {
                continue;
            }
            if(isLotus(cellGrab[0])) {
                const nextState = quickCopyState(gameState)
                const lotus = nextState.gameCells[cellIndex].pop()
                if (!lotus || !isLotus(lotus)) {
                    throw new Error(`expected lotus, instead found:  ${lotus}`)
                }
                lotus.locked = true;
                nextState.lotusCell = lotus;
                const hash = Solver.getStateHash(nextState);
                const move = {
                    gameState: nextState,
                    description: "collect lotus",
                    hash,
                    isWin: hash === Solver.winHash,
                    moveType: MoveType.LotusCollection
                }


                return [move]
            }
        }
        
        return [];
    }

    getDragonCollection(grabs: Cell[], gameState: GameState): Move[] {
        
        const collectDragons = (color: Color): Move|false => {
            const dragonIndices = []

            let collectAt = -1;
            
            for(const [cellIndex, cellGrab] of grabs.entries()) {
                if(cellGrab.length === 0 && cellIndex >= 8) {
                    collectAt = cellIndex;
                }
                if (cellGrab.length !== 1) {
                    continue;
                }
                const topCard = cellGrab[0];
                if (!isDragon(topCard) || topCard.color !== color) {
                    continue;
                }
                dragonIndices.push(cellIndex);
            }
            if(dragonIndices.length !== 4) {
                return false;
            }

            // Get the highest dragon index, and the highest empty free cell to determine if we can collect
            collectAt = Math.max(collectAt, Math.max(...dragonIndices));
            if(collectAt < 8) {
                return false;
            }
            const freeSlotIndex = collectAt - 8;
            const nextState = quickCopyState(gameState);
            let dragon;
            // pop off all the dragons
            for(let i of dragonIndices) {
                if (i < 8) {
                    nextState.gameCells[i].pop();
                }
                else {
                    nextState.freeCards[i-8] = null;
                }
            }
            nextState.freeCards[freeSlotIndex] = {isDragon: true, locked: true, color}
            const hash = Solver.getStateHash(nextState);
            const move = {
                gameState: nextState,
                description: `collect ${color.toLowerCase()} dragons`,
                hash,
                isWin: hash === Solver.winHash,
                moveType: MoveType.DragonCollection
            }
            
            return move;
        }

        return [collectDragons('RED'), collectDragons('GREEN'), collectDragons('BLACK')].filter((item) => !!item);
    }
    

    getNumberCollection(grabs: Cell[], gameState: GameState): Move[] {
        /**
         * For every currently exposed end-card we check if 
         * there are any other cards still in game which can be 
         * placed on them that are themselves not end-cards. If 
         * there are such cards left anywhere, the end-card in 
         * question stays, otherwise it is moved to the solved 
         * pile automatically.
         */

        // First we find all exposed end cards.
        const exposedEndCards: {cellIndex: number, card: NumberCard}[] = []
        for(const [cellIndex, cellGrab] of grabs.entries()) {
            const topCard = cellGrab[0];
            if (!topCard || !isNumber(topCard)){
                continue;
            }
            const rankVal = Number(topCard.rank);
            const stack = getStackFromColor(gameState, topCard.color);
            if (stack + 1 === rankVal) {
                exposedEndCards.push({card: topCard, cellIndex})
            }
        }


        const moves: Move[] = []
        // Then we check if there are any cards that can be placed on them still in the game.
        // If there are none, or if these cards are end cards themselves.
        for(const {card, cellIndex} of exposedEndCards) {
            const childRankVal = Number(card.rank) - 1;
            // We get all colors that could be placed on the end card
            let stacks = getAltStacksFromColor(gameState, card.color);
            // We check the smallest rank card of these colors still on board
            const smallestComplimentEndCard = Math.min(...stacks) + 1
            // If that card is >= rank than our expoed end card, then we should collect
            if (smallestComplimentEndCard >= childRankVal) {
                
                const nextState = quickCopyState(gameState);
                if(cellIndex < 8) {
                    nextState.gameCells[cellIndex].pop()
                }
                else {
                    nextState.freeCards[cellIndex-8] = null;
                }

                if (card.color === "RED") {
                    nextState.redStack++;

                } else if (card.color === "GREEN") {
                    nextState.greenStack++;
                } else {
                    nextState.blackStack++;
                }

                const hash = Solver.getStateHash(nextState);
                moves.push({
                    gameState: nextState,
                    description: `collect ${card.color.toLowerCase()} ${card.rank}`,
                    hash,
                    isWin: hash === Solver.winHash,
                    moveType: MoveType.NumberCollection
                })
               
            }
        }

        return moves;
    }

    getFreeSlotToCell(grabs: Cell[], gameState: GameState): Move[] {
        let moves: Move[] = []
        for(const [freeCardIndex, freeCardValue] of gameState.freeCards.entries()) {
           
            if (!freeCardValue || (freeCardValue as Lockable).locked){
                continue;
            }
            if (isDragon(freeCardValue)) {
                // Move dragon to empty game cell
                for(let i = 0; i < gameState.gameCells.length; i++) {
                    if(gameState.gameCells[i].length === 0) {
                        // Generate a move of the dragon to this cell.
                        const nextState = quickCopyState(gameState);
                        nextState.freeCards[freeCardIndex] = null;
                        nextState.gameCells[i].push(freeCardValue);

                        const hash = Solver.getStateHash(nextState);
                        moves.push({
                            gameState: nextState,
                            description: `move ${freeCardValue.color.toLowerCase()} dragon to cell[${i}]`,
                            hash,
                            isWin: hash === Solver.winHash,
                            moveType: MoveType.FreeSlotToCell
                        })
                        break;

                    }
                }

                continue;
            }
            else if (isLotus(freeCardValue)) {
                // this should never happen
                continue;
            }

            // Number cards
            for(let i = 0; i < gameState.gameCells.length; i++) {
                const topCard = gameState.gameCells[i][gameState.gameCells[i].length-1];
                let doneEmpty = false;
                if(canMoveAOntoB(freeCardValue, topCard)) {
                    if (topCard === undefined) {
                        if(doneEmpty) {
                            continue;
                        }
                        doneEmpty = true;
                    }
                    // Generate a move of the card to this empty cell.
                    const nextState = quickCopyState(gameState);
                    nextState.freeCards[freeCardIndex] = null;
                    nextState.gameCells[i].push(freeCardValue);

                    const hash = Solver.getStateHash(nextState);
                    moves.push({
                        gameState: nextState,
                        description: `move ${freeCardValue.color.toLowerCase()} ${freeCardValue.rank} to cell[${i}]`,
                        hash,
                        isWin: hash === Solver.winHash,
                        moveType: MoveType.FreeSlotToCell
                    })
                }
            }

        }


        return moves;
    }

    getCellToCell(grabs: Cell[], gameState: GameState): Move[] {

        let moves = []
        const canPutGrabOnTopCard = (cell:Cell, topCard: Card) => {


        }

        for(const [outerGrabCellIndex, outerGrabCell] of grabs.entries()) {
            if (outerGrabCellIndex >= 8) {
                continue; // Don't consider free cells here :)
            }

            if(outerGrabCell.length === 0) {
                continue; // No grab to consider
            }

            let doneEmpty = false
            for(const [innerGameCellIndex, innerGameCell] of gameState.gameCells.entries()) {
                if (outerGrabCellIndex === innerGameCellIndex) {
                    continue;
                }
                const topCard = innerGameCell[innerGameCell.length-1];
                
                if (topCard && (isDragon(topCard) || isLotus(topCard))) {
                    // We can't put a cell on these card types
                    continue;
                }
                const descriptionTemp = (n: number) => `move ${n} elements from cell ${outerGrabCellIndex} to ${innerGameCellIndex}`

                if (topCard && isNumber(topCard)) {
                    for(let g = 0; g < outerGrabCell.length; g++) {
                        const topOfGrab = outerGrabCell[g];
                        if (!isNumber(topOfGrab)) {
                            break;
                        }

                        if (canMoveAOntoB(topOfGrab, topCard)) {
                            const nextState = quickCopyState(gameState);
                            const subgrab = nextState.gameCells[outerGrabCellIndex].splice(-g-1);
                            nextState.gameCells[innerGameCellIndex] = nextState.gameCells[innerGameCellIndex].concat(subgrab);
                            const hash = Solver.getStateHash(nextState);
                            moves.push({
                                gameState: nextState,
                                description: descriptionTemp(g+1),
                                hash,
                                isWin: hash === Solver.winHash,
                                moveType: MoveType.CellToCell
                                
                            })
                            break;
                        }

                       

                    }
                    continue;
                }
                if (doneEmpty) {
                    continue;
                }
                doneEmpty = true;
                
                

                // Destination cell is empty, run through the grab.
                for(let g = 0; g < outerGrabCell.length; g++) {
                    const nextState = quickCopyState(gameState);
                    const subgrab = nextState.gameCells[outerGrabCellIndex].splice(-g-1);
                    nextState.gameCells[innerGameCellIndex] = nextState.gameCells[innerGameCellIndex].concat(subgrab);
                    const hash = Solver.getStateHash(nextState);
                    moves.push({
                        gameState: nextState,
                        description: descriptionTemp(g+1),
                        hash,
                        isWin: hash === Solver.winHash,
                        moveType: MoveType.CellToCell
                        
                    })

                }
                


            }

        }

        return moves;
    }

    getCellToFreeSlot(grabs: Cell[], gameState: GameState): Move[] {
        let moves: Move[] = []
        
        for(const [gameCellIndex, gameCell] of gameState.gameCells.entries()) {
           
            if (gameCell.length === 0) {
                continue;
            }
            const topCard = gameCell[gameCell.length-1];

            if (isDragon(topCard) || isNumber(topCard)) {
                // Move dragon to empty free cell
                for(let i = 0; i < gameState.freeCards.length; i++) {
                    if(gameState.freeCards[i] !== null) {
                        continue;
                    }
                    // Generate a move of the dragon to this free Card.
                    const nextState = quickCopyState(gameState);
                    const movedCard = nextState.gameCells[gameCellIndex].pop() 
                    if (!movedCard || isLotus(movedCard)) {
                        throw new Error("expected a dragon or number card");
                    }
                    nextState.freeCards[i] = movedCard;
                    const hash = Solver.getStateHash(nextState);
                    const description = `move ${movedCard.color.toLowerCase()} ${isDragon(movedCard) ? 'dragon' : movedCard.rank} to free[${i}]`
                    moves.push({
                        gameState: nextState,
                        description,
                        hash,
                        isWin: hash === Solver.winHash,
                        moveType: MoveType.CellToFreeSlot
                    })
                    break;
                }

                continue;
            }
            else if (isLotus(topCard)) {
                // We can't move lotus except to lotus slot
                continue;
            }

        }


        return moves;
    }

    // Returns moves in order of priority
    getAllMovesFrom(gameState: GameState): {moves: Move[], freeMoves: Move[]} {
        //console.log("getAllMovesFrom");
        // const grabs = this.getAllGrabs(gameState);

        const grabs: Cell[] = [] 

        let emptyCells = 0;
        for(let c = 0; c < gameState.gameCells.length; c++) {
            const cell = gameState.gameCells[c];
            if (!cell.length) {
                emptyCells++;
                grabs.push([])
                continue;
            }

            const topCard = cell[cell.length-1];
            if (isLotus(topCard) || isDragon(topCard)) {
                grabs.push([topCard]);
            }
            else {
                let grab = [topCard];
                let s = cell.length - 2;
                let lastCard = topCard;
                while(s >= 0) {
                    let nextCard = cell[s];
                    if (!isNumber(nextCard)) {
                        break;
                    }
                    if (Number(nextCard.rank)-1 !== Number(lastCard.rank) || nextCard.color === lastCard.color) {
                        break;
                    }
                    grab.push(nextCard);

                    s--;
                }
                grabs.push(grab);
            }
        }
        let emptyFreeCards = 0;
        for(let f = 0; f < gameState.freeCards.length; f++) {
            const card = gameState.freeCards[f];
            if (card && !(card as Lockable).locked) {
                grabs.push([card]);
            }
            else {
                emptyFreeCards++;
                grabs.push([])
            }
        }
        
        let freeMoves: Move[] = []
        // Free moves
        freeMoves = freeMoves.concat(this.getLotusCollection(grabs, gameState))
        freeMoves = freeMoves.concat(this.getNumberCollection(grabs, gameState));

        let moves: Move[] = []
        // Potentially costly moves
        moves = moves.concat(this.getDragonCollection(grabs, gameState))
        moves = moves.concat(this.getFreeSlotToCell(grabs, gameState));

        moves = moves.concat(this.getCellToCell(grabs, gameState));

        // Costly moves
        moves = moves.concat(this.getCellToFreeSlot(grabs, gameState));

        // console.log(moves)



        return {moves, freeMoves};
        // return [
        //     ...this.getLotusCollection(grabs),
        //     ...this.getDragonCollection(grabs),
        //     ...this.getNumberCollection(grabs),
        //     ...this.getFreeSlotToCell(grabs),
        //     ...this.getCellToCell(grabs),
        //     ...this.getCellToFreeSlot(grabs),
        // ]
    }




}