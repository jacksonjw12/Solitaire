import {Card, Color,Cell, COLORS, Game, GameState, NumberCard, isNumber,NumberStack, RANKS, Rank, isDragon, isLotus, WIN_STATE, Lockable} from './interface'
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
    

    constructSolution(node: Move): Solution {
        let path = [node];
        let atOrigin = false;
        while(!atOrigin) {
            const parent = this.parentMap.get(path[path.length-1].hash);
            if (parent) {
                path.push(parent.parentMove);
            }
            else {
                atOrigin = true;
            }
        }
        return path.reverse();
    }

   
    solveFrom(gameState: GameState): Solution | false {
        console.log("solving");

        const fullyExplore = false;

        const stack: Solution = [{moveType: MoveType.Initial,gameState, hash: Solver.getStateHash(gameState)}];
        while (stack.length) {
            const node = stack.pop();
            if (!node) {
                throw new Error("node was empty");
            }
            const {gameState, hash, isWin} = node;
            
            if (this.visitedMap.has(hash)) {
                continue;
            }
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

            const moves = this.getAllMovesFrom(gameState);
            for (const move of moves) {
                
                const parentMap = this.parentMap.get(move.hash);
                if (parentMap === undefined || (parentMap && parentMap.parentDepth > myDepth)) {
                    // Found a closer way or initial way to get to this move.
                    this.parentMap.set(move.hash, {parentMove: node, parentDepth: myDepth})
                }
                if (!this.visitedMap.has(move.hash)) {
                    stack.push(move)
                }
            }


        }
        return false;

    }


    getLotusCollection(grabs: Cell[], gameState: GameState): Move[] {
        for(const [cellIndex, cellGrab] of grabs.entries()) {
            if (cellGrab.length !== 1) {
                continue;
            }
            if(isLotus(cellGrab[0])) {
                const nextState = quickCopyState(gameState)
                console.log("found lotus @", cellIndex)
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

                console.log(move);

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
                if (i <= 7) {
                    nextState.gameCells[i].pop();
                }
                else {
                    nextState.freeCards[i-5] = null;
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

        // First we find all exposed end cards

        const endCards = gameState.numberStacks.map<NumberCard>(({color, number}) => {
            return {color, rank: `${number+1}`};
        });
        
        

            

        // Then we check if there are any cards that can be placed on them still in the game

        // If there are none, or if these cards are end cards themselves
        // Fold


        return [];
    }

    getFreeSlotToCell(gameState: GameState): Move[] {
        return []
    }

    getCellToCell(gameState: GameState): Move[] {
        return []
    }

    getCellToFreeSlot(gameState: GameState): Move[] {
        return []
    }

    getAllGrabs(gameState: GameState): Move[] {
        
        


        return [];
    }

    // Returns moves in order of priority
    getAllMovesFrom(gameState: GameState): Move[] {
        // const grabs = this.getAllGrabs(gameState);

        let moves: Move[] = []

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
        
        // Free moves
        moves = moves.concat(this.getLotusCollection(grabs, gameState))
        moves = moves.concat(this.getNumberCollection(grabs, gameState));

        // Potentially costly moves
        moves = moves.concat(this.getDragonCollection(grabs, gameState))

        // Costly moves



        return moves;
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