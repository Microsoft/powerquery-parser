import { expect } from "chai";
import "mocha";
import { Inspection } from "../..";
import { Option, ResultKind } from "../../common";
import { Lexer, LexerSnapshot, TokenPosition, TriedLexerSnapshot } from "../../lexer";
import { Parser, ParserError } from "../../parser";

type AbridgedNode = ReadonlyArray<[Inspection.NodeKind, Option<TokenPosition>, Option<TokenPosition>]>;

function expectTriedParse(text: string): Parser.TriedParse {
    const state: Lexer.State = Lexer.stateFrom(text);
    const maybeErrorLineMap: Option<Lexer.ErrorLineMap> = Lexer.maybeErrorLineMap(state);
    if (!(maybeErrorLineMap === undefined)) {
        throw new Error(`AssertFailed: maybeErrorLineMap === undefined`);
    }

    const snapshotResult: TriedLexerSnapshot = LexerSnapshot.tryFrom(state);
    if (!(snapshotResult.kind === ResultKind.Ok)) {
        throw new Error(`AssertFailed: snapshotResult.kind === ResultKind.Ok`);
    }
    const snapshot: LexerSnapshot = snapshotResult.value;

    return Parser.parse(snapshot);
}

function expectParseErr(text: string): ParserError.ParserError {
    const triedParse: Parser.TriedParse = expectTriedParse(text);
    if (!(triedParse.kind === ResultKind.Err)) {
        throw new Error(`AssertFailed: triedParse.kind === ResultKind.Err`);
    }

    if (!(triedParse.error instanceof ParserError.ParserError)) {
        throw new Error(`AssertFailed: triedParse.error instanceof ParserError: ${triedParse.error.message}`);
    }

    return triedParse.error;
}

function expectParseOk(text: string): Parser.ParseOk {
    const triedParse: Parser.TriedParse = expectTriedParse(text);
    if (!(triedParse.kind === ResultKind.Ok)) {
        throw new Error(`AssertFailed: triedParse.kind === ResultKind.Ok`);
    }
    return triedParse.value;
}

function expectParseOkAbridgedNodesEqual(text: string, position: Inspection.Position, expected: AbridgedNode): void {
    const parseOk: Parser.ParseOk = expectParseOk(text);
    const triedInspect: Inspection.TriedInspect = Inspection.tryFrom(
        position,
        parseOk.nodeIdMapCollection,
        parseOk.leafNodeIds,
    );
    expectAbridgedNodesEqual(triedInspect, expected);
}

function expectParseErrAbridgedNodesEqual(text: string, position: Inspection.Position, expected: AbridgedNode): void {
    const parserError: ParserError.ParserError = expectParseErr(text);
    const triedInspect: Inspection.TriedInspect = Inspection.tryFrom(
        position,
        parserError.context.nodeIdMapCollection,
        parserError.context.leafNodeIds,
    );
    expectAbridgedNodesEqual(triedInspect, expected);
}

function expectAbridgedNodesEqual(triedInspect: Inspection.TriedInspect, expected: AbridgedNode): void {
    if (!(triedInspect.kind === ResultKind.Ok)) {
        throw new Error(`AssertFailed: triedInspect.kind === ResultKind.Ok`);
    }
    const inspection: Inspection.Inspection = triedInspect.value;
    const actual: AbridgedNode = inspection.nodes.map(node => [
        node.kind,
        node.maybePositionStart,
        node.maybePositionEnd,
    ]);

    expect(actual.length).to.equal(expected.length, "expected and actual lengths don't match");

    for (let index: number = 0; index < expected.length; index += 1) {
        const actualKind: Inspection.NodeKind = actual[index][0];
        const expectedKind: Inspection.NodeKind = expected[index][0];
        expect(actualKind).to.equal(expectedKind, `line: ${index}`);

        const actualPositionStart: Option<TokenPosition> = actual[index][1];
        const expectedPositionStart: Option<TokenPosition> = actual[index][1];
        if (expectedPositionStart !== undefined) {
            expect(actualPositionStart).deep.equal(expectedPositionStart, `line: ${index}`);
        }

        const actualPositionEnd: Option<TokenPosition> = actual[index][1];
        const expectedPositionEnd: Option<TokenPosition> = actual[index][1];
        if (expectedPositionEnd !== undefined) {
            expect(actualPositionEnd).deep.equal(expectedPositionEnd, `line: ${index}`);
        }
    }
}

describe(`Inspection`, () => {
    describe(`Nodes`, () => {
        describe(`Record`, () => {
            it(`[a=1] at (0, 0)`, () => {
                const text: string = `[a=1]`;
                const position: Inspection.Position = {
                    lineNumber: 0,
                    lineCodeUnit: 0,
                };
                const expected: AbridgedNode = [];
                expectParseOkAbridgedNodesEqual(text, position, expected);
            });

            it(`[a=1] at (0, 1)`, () => {
                const text: string = `[a=1]`;
                const position: Inspection.Position = {
                    lineNumber: 0,
                    lineCodeUnit: 1,
                };
                const expected: AbridgedNode = [[Inspection.NodeKind.Record, undefined, undefined]];
                expectParseOkAbridgedNodesEqual(text, position, expected);
            });

            it(`[a=1] at (0, 5)`, () => {
                const text: string = `[a=1]`;
                const position: Inspection.Position = {
                    lineNumber: 0,
                    lineCodeUnit: 5,
                };
                const expected: AbridgedNode = [];
                expectParseOkAbridgedNodesEqual(text, position, expected);
            });

            it(`[a=1 at (0, 0)`, () => {
                const text: string = `[a=1`;
                const position: Inspection.Position = {
                    lineNumber: 0,
                    lineCodeUnit: 0,
                };
                const expected: AbridgedNode = [];
                expectParseErrAbridgedNodesEqual(text, position, expected);
            });

            it(`[a=1 at (0, 1)`, () => {
                const text: string = `[a=1`;
                const position: Inspection.Position = {
                    lineNumber: 0,
                    lineCodeUnit: 1,
                };
                const expected: AbridgedNode = [[Inspection.NodeKind.Record, undefined, undefined]];
                expectParseErrAbridgedNodesEqual(text, position, expected);
            });

            it(`[a=1 at (0, 4)`, () => {
                const text: string = `[a=1`;
                const position: Inspection.Position = {
                    lineNumber: 0,
                    lineCodeUnit: 5,
                };
                const expected: AbridgedNode = [[Inspection.NodeKind.Record, undefined, undefined]];
                expectParseErrAbridgedNodesEqual(text, position, expected);
            });
        });
    });
});
