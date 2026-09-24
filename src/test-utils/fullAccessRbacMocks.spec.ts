import {
  applyFullAccessUseAccessReviewMock,
  FULL_ACCESS_USE_ACCESS_REVIEW_RESULT,
} from './fullAccessRbacMocks';

describe('fullAccessRbacMocks', () => {
  it('applyFullAccessUseAccessReviewMock returns allow tuple', () => {
    const mockUseAccessReview = jest.fn();
    applyFullAccessUseAccessReviewMock(mockUseAccessReview);

    expect(mockUseAccessReview()).toEqual(FULL_ACCESS_USE_ACCESS_REVIEW_RESULT);
  });
});
