import { expect } from "chai";
import "mocha";
import { Inspection } from "../..";
import { Option, ResultKind } from "../../common";
import { Lexer, LexerSnapshot, TokenPosition, TriedLexerSnapshot } from "../../lexer";
import { Parser } from "../../parser";

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

function expectTriedInspect(text: string, position: Inspection.Position): Inspection.TriedInspect {
    const triedParse: Parser.TriedParse = expectTriedParse(text);
    return Inspection.tryFrom(position, triedParse);
}

function expectAbridgedNodes(text: string, position: Inspection.Position, expected: AbridgedNode): void {
    const triedInspect: Inspection.TriedInspect = expectTriedInspect(text, position);
    if (!(triedInspect.kind === ResultKind.Ok)) {
        throw new Error(`AssertFailed: triedInspect.kind === ResultKind.Ok`);
    }
    const inspection: Inspection.Inspection = triedInspect.value;
    const actual: AbridgedNode = inspection.nodes.map(node => [node.kind, node.positionStart, node.maybePositionEnd]);

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
            it(`[] at (0, 0)`, () => {
                const text: string = `[]`;
                const position: Inspection.Position = {
                    lineNumber: 0,
                    lineCodeUnit: 0,
                };
                const expected: AbridgedNode = [];
                expectAbridgedNodes(text, position, expected);
            });

            it(`[] at (0, 1)`, () => {
                const text: string = `[]`;
                const position: Inspection.Position = {
                    lineNumber: 0,
                    lineCodeUnit: 1,
                };
                const expected: AbridgedNode = [[Inspection.NodeKind.Record, undefined, undefined]];
                expectAbridgedNodes(text, position, expected);
            });

            it(`[] at (0, 2)`, () => {
                const text: string = `[]`;
                const position: Inspection.Position = {
                    lineNumber: 0,
                    lineCodeUnit: 2,
                };
                const expected: AbridgedNode = [];
                expectAbridgedNodes(text, position, expected);
            });
        });
    });
});