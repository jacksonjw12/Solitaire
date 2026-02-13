export const RANKS = ['1', '2',  '3', '4', '5', '6', '7', '8', '9']
export type Rank = (typeof RANKS)[number];

export const COLORS = ['GREEN', 'RED', 'BLACK']
export type Color = (typeof COLORS)[number];

export interface Lockable {
    locked: boolean
}

// When a lotus is collected it is locked
export interface Lotus extends Lockable {
    isLotus: boolean // simple identifier
}

// When a dragon is collapsed it is locked
export interface Dragon extends Lockable {
    isDragon: boolean // simple identifier
    color: Color
}

export function isDragon(card: Card): card is Dragon {
    return !!(card as Dragon).isDragon
}

export function isLotus(card: Card): card is Lotus {
    return !!(card as Lotus).isLotus
}

export function isNumber(card: Card): card is NumberCard {
    return !!(card as NumberCard).rank;
}

export function cardEquals(cardA: Card, cardB: Card) {
    if (isDragon(cardA) && isDragon(cardB)) {
        return cardA.color === cardB.color;
    }
    else if (isNumber(cardA) && isNumber(cardB)) {
        return cardA.color === cardB.color && cardA.rank === cardB.rank;
    }
    return false;
}

export interface NumberCard {
    color: Color
    rank: Rank
}


export type Card = NumberCard | Dragon | Lotus
export type Cell = Card[];


export interface GameState {
    // Top left
    freeCards: [Card|null, Card|null, Card|null]
    // Top mid
    lotusCell: Lotus | null
    // Top Right
    redStack: number
    greenStack: number
    blackStack: number

    gameCells: [Cell, Cell, Cell, Cell, Cell, Cell, Cell, Cell]

    metadata?: GameStateMetadata

}

export interface CellState {
    empty: boolean

    grabbable: Lotus | Dragon | NumberCard[]
}

export interface GameStateMetadata {
    gameCellsState: [CellState, CellState, CellState, CellState, CellState, CellState, CellState, CellState]
    emptyCardSlots: number
    emptyGameCells: number

    scoreEstimate: number
}


export interface Game {
    gameState?: GameState
}


export const WIN_STATE: GameState = {
    freeCards: [{color: 'GREEN', isDragon: true, locked: true}, {color: 'BLACK', isDragon: true, locked: true}, {color: 'RED', isDragon: true, locked: true}],
    lotusCell: {isLotus: true, locked: true},
    gameCells: [[],[],[],[],[],[],[],[]],
    redStack: 9,
    greenStack: 9,
    blackStack: 9
}
