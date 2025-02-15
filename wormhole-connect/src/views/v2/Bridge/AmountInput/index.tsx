import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { makeStyles } from 'tss-react/mui';
import { useDebounce } from 'use-debounce';
import { useTheme } from '@mui/material';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import AlertBannerV2 from 'components/v2/AlertBanner';
import useGetTokenBalances from 'hooks/useGetTokenBalances';
import { setAmount } from 'store/transferInput';
import { toFixedDecimals } from 'utils/balance';
import { getMaxAmt, validateAmount } from 'utils/transferValidation';
import type { TokenConfig } from 'config/types';
import type { RootState } from 'store';

const useStyles = makeStyles()((theme) => ({
  amountContainer: {
    width: '100%',
    maxWidth: '420px',
  },
  amountCardContent: {
    display: 'flex',
    alignItems: 'center',
  },
  amountTitle: {
    color: theme.palette.text.secondary,
    display: 'flex',
    minHeight: '40px',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorContainer: {
    display: 'flex',
    alignContent: 'center',
    marginTop: '8px',
  },
}));

type Props = {
  supportedSourceTokens: Array<TokenConfig>;
};

/**
 * Renders the input control to set the transaction amount
 */
const AmountInput = (props: Props) => {
  const { classes } = useStyles();
  const dispatch = useDispatch();
  const theme = useTheme();

  const { sending: sendingWallet } = useSelector(
    (state: RootState) => state.wallet,
  );

  const {
    fromChain: sourceChain,
    token: sourceToken,
    amount,
    route,
  } = useSelector((state: RootState) => state.transferInput);

  const [tokenAmount, setTokenAmount] = useState(amount);
  const [validationResult, setValidationResult] = useState('');

  // Debouncing validation to prevent false-positive results while user is still typing
  const [debouncedValidationResult] = useDebounce(validationResult, 500);

  const { balances, isFetching } = useGetTokenBalances(
    sendingWallet?.address || '',
    sourceChain,
    props.supportedSourceTokens || [],
  );

  const tokenBalance = useMemo(
    () => balances?.[sourceToken]?.balance || '',
    [balances, sourceToken],
  );

  const isInputDisabled = useMemo(
    () => !sourceChain || !sourceToken,
    [sourceChain, sourceToken],
  );

  const balance = useMemo(() => {
    if (isInputDisabled || !sendingWallet.address) {
      return null;
    }

    return (
      <Stack direction="row" alignItems="center">
        <Typography fontSize={14} textAlign="right" sx={{ marginRight: '4px' }}>
          Balance:
        </Typography>
        {isFetching ? (
          <CircularProgress size={14} />
        ) : (
          <Typography fontSize={14} textAlign="right">
            {Number.parseFloat(toFixedDecimals(`${tokenBalance}`, 6))}
          </Typography>
        )}
      </Stack>
    );
  }, [isInputDisabled, balances, tokenBalance, sendingWallet.address]);

  useEffect(() => {
    // Validation for the amount value
    const amountValidation = validateAmount(
      tokenAmount,
      tokenBalance,
      getMaxAmt(route),
    );

    // Validation result is truty when there are errors
    if (amountValidation) {
      // Reset the amount value when there are errors
      dispatch(setAmount(''));
    } else {
      dispatch(setAmount(tokenAmount));
    }

    setValidationResult(amountValidation);
  }, [tokenAmount, tokenBalance, route, validationResult]);

  const maxButton = useMemo(() => {
    return (
      <Button
        sx={{ minWidth: '32px', padding: '4px' }}
        disabled={isInputDisabled || !tokenBalance}
        onClick={() => {
          if (tokenBalance) {
            const trimmedTokenBalance = toFixedDecimals(`${tokenBalance}`, 6);
            setTokenAmount(trimmedTokenBalance);
          }
        }}
      >
        <Typography fontSize={14} textTransform="none">
          Max
        </Typography>
      </Button>
    );
  }, [isInputDisabled, tokenBalance]);

  // Update token amount in both local and Redux states
  const onAmountChange = useCallback(
    (e: any) => {
      const { value } = e.target;

      if (value !== tokenAmount) {
        setTokenAmount(value);
      }
    },
    [tokenAmount],
  );

  return (
    <div className={classes.amountContainer}>
      <div className={classes.amountTitle}>
        <Typography variant="body2">Amount:</Typography>
      </div>
      <Card variant="elevation">
        <CardContent className={classes.amountCardContent}>
          <TextField
            fullWidth
            disabled={isInputDisabled}
            inputProps={{
              style: {
                color: debouncedValidationResult
                  ? theme.palette.error.main
                  : theme.palette.text.primary,
                fontSize: 24,
                height: '40px',
                padding: '4px',
              },
            }}
            placeholder="0"
            variant="standard"
            value={tokenAmount}
            onChange={onAmountChange}
            onWheel={(e) => {
              // IMPORTANT: We need to prevent the scroll behavior on number inputs.
              // Otherwise it'll increase/decrease the value when user scrolls on the input control.
              // See for details: https://github.com/mui/material-ui/issues/7960
              if (e.target instanceof HTMLElement) {
                e.target.blur();
              }
            }}
            InputProps={{
              disableUnderline: true,
              endAdornment: (
                <InputAdornment position="end">
                  <Stack alignItems="end">
                    {maxButton}
                    {balance}
                  </Stack>
                </InputAdornment>
              ),
              type: 'number',
            }}
          />
        </CardContent>
      </Card>
      <AlertBannerV2
        error
        content={debouncedValidationResult}
        show={!!debouncedValidationResult}
      />
    </div>
  );
};

export default AmountInput;
