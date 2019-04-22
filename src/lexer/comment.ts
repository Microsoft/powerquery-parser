import { TokenPosition } from "./token";

export type TComment = (
    | LineComment
    | MultilineComment
)

export const enum CommentKind {
    Line = "Line",
    Multiline = "Multiline",
}

export interface IComment {
    readonly kind: CommentKind,
    readonly literal: string,
    readonly containsNewline: boolean,
    readonly positionStart: TokenPosition,
    readonly positionEnd: TokenPosition,
}

export interface LineComment extends IComment {
    readonly kind: CommentKind.Line,
}

export interface MultilineComment extends IComment {
    readonly kind: CommentKind.Multiline,
}
