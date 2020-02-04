// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { expect } from "chai";
import "mocha";
import { ResultUtils } from "../../common";
import { Lexer, LexerSnapshot, TriedLexerSnapshot } from "../../lexer";
import { IParserState, IParserStateUtils, ParseError, Parser, TriedParse } from "../../parser";
import { TokenWithColumnNumber } from "../../parser/error";
import { DefaultSettings } from "../../settings";

function expectExpectedTokenKindError(text: string): ParseError.ExpectedTokenKindError {
    const lexerState: Lexer.State = Lexer.stateFrom(DefaultSettings, text);
    const triedSnapshot: TriedLexerSnapshot = LexerSnapshot.tryFrom(lexerState);

    if (!ResultUtils.isOk(triedSnapshot)) {
        throw new Error(`AssertFailed: ResultUtils.isOk(triedSnapshot)`);
    }
    const lexerSnapshot: LexerSnapshot = triedSnapshot.value;

    const parserState: IParserState = IParserStateUtils.newState(DefaultSettings, lexerSnapshot);
    const triedParse: TriedParse = Parser.CombinatorialParser.readDocument(parserState, Parser.CombinatorialParser);

    if (!ResultUtils.isErr(triedParse)) {
        throw new Error(`AssertFailed: ResultUtils.isErr(triedParse)`);
    }
    const error: ParseError.TParseError = triedParse.error;

    if (!(error instanceof ParseError.ParseError)) {
        const details: {} = {
            error2json: JSON.stringify(error, undefined, 4),
            message: error.message,
        };
        throw new Error(`AssertFailed: error instanceof ParseError.ParseError - ${details}`);
    }
    const innerError: ParseError.TInnerParseError = error.innerError;

    if (!(innerError instanceof ParseError.ExpectedTokenKindError)) {
        const details: {} = {
            innerError2json: JSON.stringify(innerError, undefined, 4),
            message: innerError.message,
        };
        throw new Error(`AssertFailed: innerError instanceof ParseError.ExpectedTokenKindError - ${details}`);
    }

    return innerError;
}

function expectErrorAt(text: string, lineNumber: number, columnNumber: number, codeUnit: number): void {
    const error: ParseError.ExpectedTokenKindError = expectExpectedTokenKindError(text);

    if (!(error.maybeFoundToken !== undefined)) {
        throw new Error(`AssertFailed: error.maybeFoundToken !== undefined`);
    }
    const foundToken: TokenWithColumnNumber = error.maybeFoundToken;

    expect(foundToken.token.positionStart.codeUnit).to.equal(codeUnit, "codeUnit");
    expect(foundToken.token.positionStart.lineNumber).to.equal(lineNumber, "lineNumber");
    expect(foundToken.columnNumber).to.equal(columnNumber, "columnNumber");
}

describe(`Parser.ColumnNumber`, () => {
    it(`if x foo`, () => {
        expectErrorAt(`if x foo`, 0, 5, 5);
    });

    it(`if x \\nfoo`, () => {
        expectErrorAt(`if x \nfoo`, 1, 0, 6);
    });

    it(`if x \\n foo`, () => {
        expectErrorAt(`if x \n foo`, 1, 1, 7);
    });

    it(`if \u006E\u0303 foo`, () => {
        expectErrorAt(`if \u006E\u0303 foo`, 0, 5, 6);
    });

    it(`if \u006E\u0303 \\nfoo`, () => {
        expectErrorAt(`if \u006E\u0303 \nfoo`, 1, 0, 7);
    });

    it(`if \u006E\u0303 \\n foo`, () => {
        expectErrorAt(`if \u006E\u0303 \n foo`, 1, 1, 8);
    });
});
